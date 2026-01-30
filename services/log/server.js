const express = require('express');
const { Client } = require('@elastic/elasticsearch');
const amqp = require('amqplib');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3009;

// Elasticsearch client configuration
const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
const INDEX_NAME = 'logs';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';

// Load Swagger documentation
const swaggerDocument = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Elasticsearch client
let esClient;

async function connectElasticsearch() {
    try {
        esClient = new Client({ node: ELASTICSEARCH_URL });
        
        // Test connection
        await esClient.ping();
        console.log('Connected to Elasticsearch');
        
        // Create index if it doesn't exist
        const indexExists = await esClient.indices.exists({ index: INDEX_NAME });
        if (!indexExists) {
            await esClient.indices.create({
                index: INDEX_NAME,
                body: {
                    mappings: {
                        properties: {
                            user_id: { type: 'keyword' },
                            level: { type: 'integer' },
                            timestamp: { type: 'date' },
                            service: { type: 'keyword' },
                            event_type: { type: 'keyword' },
                            payload: { type: 'object', enabled: true }
                        }
                    }
                }
            });
            console.log(`Index ${INDEX_NAME} created`);
        }
    } catch (error) {
        console.error('Failed to connect to Elasticsearch:', error);
        setTimeout(connectElasticsearch, 5000); // Retry after 5 seconds
    }
}

// RabbitMQ consumer
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
                console.log("Log received:", logData);

                // Insert log into database
                await insertLog(logData);

                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        setTimeout(startRabbitMQConsumer, 5000); // Retry after 5 seconds
    }
}

// Insert log into Elasticsearch
async function insertLog(logData) {
    try {
        const document = {
            user_id: logData.user_id || logData.userId || null,
            level: logData.level || 0,
            timestamp: logData.timestamp || new Date().toISOString(),
            service: logData.service || 'unknown',
            event_type: logData.eventType || 'unknown',
            payload: logData.payload || {}
        };
        
        const result = await esClient.index({
            index: INDEX_NAME,
            document: document
        });
        
        console.log('Log inserted with ID:', result._id);
        return result._id;
    } catch (error) {
        console.error('Error inserting log:', error);
        throw error;
    }
}

// REST API Endpoints

// GET /api/logs - List logs with optional filters
app.get('/api/logs', async (req, res) => {
    try {
        const { level, service, eventType, from, to, limit } = req.query;
        
        // Build Elasticsearch query
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

// POST /api/logs - Create a new log entry
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

// GET /api/logs/:logId - Get a specific log by ID
app.get('/api/logs/:logId', async (req, res) => {
    //A implémenter quand nécessaire
    res.status(501).json({ error: 'Not implemented' });
});

// DELETE /api/logs/:logId - Delete a log entry
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

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'log-service' });
});

// Start server
async function start() {
    await connectElasticsearch();
    await startRabbitMQConsumer();
    
    app.listen(PORT, () => {
        console.log(`Log service running on port ${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
}

start();
