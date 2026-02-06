const express = require('express');
const { Client } = require('@elastic/elasticsearch');
const amqp = require('amqplib');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3009;

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
const INDEX_NAME = 'logs';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

const swaggerDocument = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

let esClient;

async function connectElasticsearch() {
    try {
        esClient = new Client({ node: ELASTICSEARCH_URL, requestTimeout: 30000 });
        
        const info = await esClient.info();
        console.log('Connected to Elasticsearch:', info.version.number);
        
        try {
            await esClient.indices.get({ index: INDEX_NAME });
            console.log(`Index ${INDEX_NAME} already exists`);
        } catch (getError) {
            if (getError.statusCode === 404) {
                try {
                    await esClient.indices.create({
                        index: INDEX_NAME,
                        body: {
                            mappings: {
                                properties: {
                                    user_id: { type: 'keyword' },
                                    level: { type: 'keyword' },
                                    timestamp: { type: 'date' },
                                    service: { type: 'keyword' },
                                    event_type: { type: 'keyword' },
                                    payload: { type: 'object', enabled: true }
                                }
                            }
                        }
                    });
                    console.log(`Index ${INDEX_NAME} created successfully`);
                } catch (createError) {
                    console.error(`Failed to create index ${INDEX_NAME}:`, createError.message);
                }
            } else {
                throw getError;
            }
        }
    } catch (error) {
        console.error('Failed to connect to Elasticsearch:', error.message);
        setTimeout(connectElasticsearch, 5000);
    }
}

async function startRabbitMQConsumer() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();
        
        const queue = 'log_queue';
        await channel.assertQueue(queue, { durable: true });

        console.log("Log service waiting for messages in queue:", queue);

        channel.consume(queue, async (msg) => {
            if (msg !== null) {
                const logData = JSON.parse(msg.content.toString());
                
                await insertLog(logData);

                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        setTimeout(startRabbitMQConsumer, 5000);
    }
}

async function insertLog(logData) {
    try {
        let levelStr = 'info';
        if (logData.level === 2 || logData.level === 'warning') levelStr = 'warning';
        if (logData.level === 3 || logData.level === 'error') levelStr = 'error';
        if (logData.level === 1 || logData.level === 'info') levelStr = 'info';
        
        const document = {
            user_id: logData.user_id || logData.userId || null,
            level: levelStr,
            timestamp: logData.timestamp || new Date().toISOString(),
            service: logData.service || 'unknown',
            event_type: logData.eventType || 'unknown',
            payload: logData.payload || {}
        };
        
        const result = await esClient.index({
            index: INDEX_NAME,
            document: document
        });
        
        return result._id;
    } catch (error) {
        console.error('[ELASTICSEARCH] Erreur sauvegarde log:', error.message);
        throw error;
    }
}

app.get('/api/logs', async (req, res) => {
    try {
        const { level, service, eventType, from, to, limit } = req.query;
        
        const must = [];
        
        if (level !== undefined) {
            must.push({ term: { level: parseInt(level) } });
        }
        
        if (service) {
            must.push({ term: { service: service } });
        }
        
        if (eventType) {
            must.push({ term: { event_type: eventType } });
        }
        
        if (from || to) {
            const range = { timestamp: {} };
            if (from) range.timestamp.gte = from;
            if (to) range.timestamp.lte = to;
            must.push({ range });
        }

        const searchQuery = {
            index: INDEX_NAME,
            body: {
                query: must.length > 0 ? { bool: { must } } : { match_all: {} },
                sort: [{ timestamp: 'desc' }],
                size: limit ? parseInt(limit) : 100
            }
        };

        const result = await esClient.search(searchQuery);
        const logs = result.hits.hits.map(hit => ({
            id: hit._id,
            ...hit._source
        }));
        
        res.json(logs);
    } catch (error) {
        console.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Failed to fetch logs' });
    }
});

app.post('/api/logs', async (req, res) => {
    try {
        const logData = req.body;
        const logId = await insertLog(logData);
        res.status(201).json({ id: logId, message: 'Log created successfully' });
    } catch (error) {
        console.error('Error creating log:', error);
        res.status(500).json({ error: 'Failed to create log' });
    }
});

app.get('/api/logs/:logId', async (req, res) => {
    res.status(501).json({ error: 'Not implemented' });
});

app.delete('/api/logs/:logId', async (req, res) => {
    try {
        const { logId } = req.params;
        await esClient.delete({
            index: INDEX_NAME,
            id: logId
        });
        
        res.status(204).send();
    } catch (error) {
        if (error.meta && error.meta.statusCode === 404) {
            return res.status(404).json({ error: 'Log not found' });
        }
        console.error('Error deleting log:', error);
        res.status(500).json({ error: 'Failed to delete log' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'log-service' });
});

async function start() {
    await connectElasticsearch();
    await startRabbitMQConsumer();
    
    app.listen(PORT, () => {
        console.log(`Log service running on port ${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
}

start();
