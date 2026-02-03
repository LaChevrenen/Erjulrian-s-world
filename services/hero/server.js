const express = require('express');
const { Client } = require('pg');
const amqp = require('amqplib');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3003;

// PostgreSQL client configuration
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'hero_user',
    password: process.env.DB_PASSWORD || 'hero_password',
    database: process.env.DB_NAME || 'erjulrian'
};

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';

// Load Swagger documentation
const swaggerDocument = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// Database connection
let dbClient;
let rabbitChannel;

async function connectDB() {
    try {
        dbClient = new Client(dbConfig);
        await dbClient.connect();
        console.log('Connected to PostgreSQL database');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        setTimeout(connectDB, 5000); // Retry after 5 seconds
    }
}

// RabbitMQ connection
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        rabbitChannel = await connection.createChannel();
        
        // Assert queues
        const logQueue = await rabbitChannel.assertQueue('log_queue', { durable: true });
        const heroQueue = await rabbitChannel.assertQueue('hero_queue', { durable: true });
        
        console.log('✓ log_queue created:', logQueue.queue);
        console.log('✓ hero_queue created:', heroQueue.queue);
        console.log('Connected to RabbitMQ');
        
        // Start consuming hero queue
        startHeroConsumer();
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        setTimeout(connectRabbitMQ, 5000);
    }
}

async function startHeroConsumer() {
    if (!rabbitChannel) {
        console.error('Cannot start hero consumer: rabbitChannel is null');
        return;
    }
    
    try {
        console.log('Starting hero queue consumer...');
        rabbitChannel.consume('hero_queue', async (msg) => {
            if (msg !== null) {
                const request = JSON.parse(msg.content.toString());
                console.log('Hero request received:', request);
                
                try {
                    const { action, type, heroId, currentHp, maxHp, xpGained } = request;
                    
                    // Handle dungeon combat result (hero HP + XP update)
                    if (type === 'hero_stats_updated') {
                        const updateResult = await dbClient.query(
                            `UPDATE hero_schema.HeroStats
                             SET current_hp = $1,
                                 xp = xp + $2,
                                 level = (FLOOR(SQRT(GREATEST(xp + $2, 0) / 100.0)) + 1)::int,
                                 updated_at = NOW()
                             WHERE hero_id = $3
                             RETURNING *`,
                            [currentHp, xpGained, heroId]
                        );

                        if (updateResult.rowCount > 0) {
                            const updatedHero = updateResult.rows[0];
                            await sendLog(heroId, 1, 'hero_stats_updated', { 
                                hero_id: heroId, 
                                current_hp: currentHp, 
                                max_hp: maxHp,
                                xp_gained: xpGained,
                                new_level: updatedHero.level
                            });
                            console.log(`Updated hero ${heroId}: HP ${currentHp}/${maxHp}, XP +${xpGained}, Level ${updatedHero.level}`);
                        }
                        
                        rabbitChannel.ack(msg);
                        return;
                    }
                    
                } catch (error) {
                    console.error('Error processing hero request:', error);
                }
                
                rabbitChannel.ack(msg);
            }
        });
        
        console.log('Hero queue consumer started');
    } catch (error) {
        console.error('Failed to start hero consumer:', error);
    }
}

// Send log to log service via RabbitMQ
async function sendLog(userId, level, eventType, payload) {
    if (!rabbitChannel) return;
    
    try {
        const logData = {
            user_id: userId,
            level: level,
            timestamp: new Date().toISOString(),
            service: 'hero',
            eventType: eventType,
            payload: payload
        };
        
        rabbitChannel.sendToQueue('log_queue', Buffer.from(JSON.stringify(logData)), { persistent: true });
    } catch (error) {
        console.error('Failed to send log:', error);
    }
}

async function publishHeroEvent(eventType, data) {
    if (!rabbitChannel) return;

    try {
        const event = {
            type: eventType,
            timestamp: new Date().toISOString(),
            ...data
        };

        rabbitChannel.sendToQueue('hero_queue', Buffer.from(JSON.stringify(event)), { persistent: true });
    } catch (error) {
        console.error('Failed to publish hero event:', error);
    }
}

// REST API Endpoints

function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// POST /api/heroes - Create a new hero
app.post('/api/heroes', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const query = `
            INSERT INTO hero_schema.HeroStats (user_id, level, xp, base_hp, current_hp, base_att, base_def, base_regen, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
            RETURNING hero_id, user_id
        `;
        
        // Starting stats
        const values = [
            userId,      // user_id
            1,           // level
            0,           // xp
            20,          // base_hp
            20,          // current_hp (initialized to max)
            4,           // base_att
            1,           // base_def
            1            // base_regen
        ];
        
        const result = await dbClient.query(query, values);
        const heroId = result.rows[0].hero_id;
        
        // Send log
        await sendLog(userId, 1, 'hero_created', { hero_id: heroId, user_id: userId, initial_stats: { hp: 20, att: 4, def: 1, regen: 1 } });
        await publishHeroEvent('hero_created', { heroId, userId });
        
        res.status(201).json({ heroId, userId });
    } catch (error) {
        console.error('Error creating hero:', error);
        res.status(500).json({ error: 'Failed to create hero' });
    }
});

// GET /api/heroes/:userId/list - Get all heroes for a user
app.get('/api/heroes/:userId/list', async (req, res) => {
    try {
        const { userId } = req.params;
        if (!isUuid(userId)) {
            return res.status(400).json({ error: 'Invalid userId format' });
        }
        const query = 'SELECT * FROM hero_schema.HeroStats WHERE user_id = $1 ORDER BY updated_at DESC';
        const result = await dbClient.query(query, [userId]);
        
        res.json(result.rows);
    } catch (error) {
        console.error('Error fetching user heroes:', error);
        res.status(500).json({ error: 'Failed to fetch user heroes' });
    }
});

// GET /api/heroes/:heroId - Get hero stats
app.get('/api/heroes/:heroId', async (req, res) => {
    try {
        const { heroId } = req.params;
        if (!isUuid(heroId)) {
            return res.status(400).json({ error: 'Invalid heroId format' });
        }
        const query = 'SELECT * FROM hero_schema.HeroStats WHERE hero_id = $1';
        const result = await dbClient.query(query, [heroId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Hero not found' });
        }
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching hero:', error);
        res.status(500).json({ error: 'Failed to fetch hero' });
    }
});


// DELETE /api/heroes/:heroId - Delete a hero
app.delete('/api/heroes/:heroId', async (req, res) => {
    try {
        const { heroId } = req.params;
        const query = 'DELETE FROM hero_schema.HeroStats WHERE hero_id = $1 RETURNING hero_id';
        const result = await dbClient.query(query, [heroId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Hero not found' });
        }
        
        // Send log
        await sendLog(heroId, 2, 'hero_deleted', { hero_id: heroId });
        
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting hero:', error);
        res.status(500).json({ error: 'Failed to delete hero' });
    }
});


// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'hero-service' });
});

// Start server
async function start() {
    await connectDB();
    await connectRabbitMQ();
    
    app.listen(PORT, () => {
        console.log(`Hero service running on port ${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
}

start();
