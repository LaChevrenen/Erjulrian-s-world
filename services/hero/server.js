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
                    const { action, heroId, xp, hp, stats } = request;
                    
                    switch (action) {
                        case 'get': {
                            // GET hero stats (reply-to support)
                            const heroResult = await dbClient.query(
                                'SELECT * FROM hero_schema.HeroStats WHERE hero_id = $1',
                                [heroId]
                            );

                            if (heroResult.rowCount > 0) {
                                console.log(`Retrieved stats for hero ${heroId}`);
                            }

                            if (msg.properties?.replyTo) {
                                const payload = heroResult.rows[0] || null;
                                rabbitChannel.sendToQueue(
                                    msg.properties.replyTo,
                                    Buffer.from(JSON.stringify(payload)),
                                    { correlationId: msg.properties.correlationId }
                                );
                            }
                            break;
                        }
                        case 'update_hero': {
                            // Combined hero update - handle XP and HP in one operation (atomic)
                            const xpDelta = request.xpDelta || 0;
                            const hpDelta = request.hpDelta || 0;

                            const updateResult = await dbClient.query(
                                `UPDATE hero_schema.HeroStats
                                 SET xp = GREATEST(xp + $1, 0),
                                     level = (FLOOR(SQRT(GREATEST(xp + $1, 0) / 100.0)) + 1)::int,
                                     base_hp = GREATEST(base_hp + $2, 0),
                                     current_hp = LEAST(GREATEST(current_hp + $2, 0), base_hp + $2),
                                     updated_at = NOW()
                                 WHERE hero_id = $3
                                 RETURNING *`,
                                [xpDelta, hpDelta, heroId]
                            );

                            if (updateResult.rowCount === 0) {
                                console.warn(`Hero ${heroId} not found`);
                                break;
                            }

                            const updatedHero = updateResult.rows[0];

                            if (xpDelta > 0) {
                                await sendLog(heroId, 1, 'xp_added', { hero_id: heroId, xp_added: xpDelta, new_level: updatedHero.level });
                                console.log(`Added ${xpDelta} XP to hero ${heroId}, new level: ${updatedHero.level}`);
                            }

                            if (hpDelta !== 0) {
                                if (hpDelta > 0) {
                                    await sendLog(heroId, 1, 'hp_healed', { hero_id: heroId, hp_healed: hpDelta });
                                    console.log(`Healed ${hpDelta} HP for hero ${heroId}`);
                                } else {
                                    await sendLog(heroId, 1, 'hp_lost', { hero_id: heroId, hp_lost: Math.abs(hpDelta) });
                                    console.log(`Lost ${Math.abs(hpDelta)} HP for hero ${heroId}`);
                                }
                            }

                            console.log(`Updated hero ${heroId}: xp=${xpDelta}, hp=${hpDelta}`);
                            break;
                        }
                        default:
                            console.warn(`Unknown action: ${action}`);
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

// XP calculation for leveling
function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
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
            INSERT INTO hero_schema.HeroStats (user_id, level, xp, base_hp, current_hp, base_att, base_def, base_regen, artifact_slot_1, artifact_slot_2, artifact_slot_3, artifact_slot_4, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::uuid, $10::uuid, $11::uuid, $12::uuid, NOW())
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
            1,           // base_regen
            null,        // artifact_slot_1 (UUID)
            null,        // artifact_slot_2 (UUID)
            null,        // artifact_slot_3 (UUID)
            null         // artifact_slot_4 (UUID)
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

// GET /api/users/:userId/heroes - Get all heroes for a user
app.get('/api/users/:userId/heroes', async (req, res) => {
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

// PUT /api/heroes/:heroId - Update hero stats
app.put('/api/heroes/:heroId', async (req, res) => {
    try {
        const { heroId } = req.params;
        const updates = req.body;
        
        // Build dynamic update query
        const fields = [];
        const values = [];
        let paramIndex = 1;
        
        const allowedFields = ['level', 'xp', 'base_hp', 'current_hp', 'base_att', 'base_def', 'base_regen', 
                               'artifact_slot_1', 'artifact_slot_2', 'artifact_slot_3', 'artifact_slot_4'];
        
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                fields.push(`${field} = $${paramIndex++}`);
                values.push(updates[field]);
            }
        }
        
        if (fields.length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        
        fields.push(`updated_at = NOW()`);
        values.push(heroId);
        
        const query = `
            UPDATE hero_schema.HeroStats 
            SET ${fields.join(', ')}
            WHERE hero_id = $${paramIndex}
            RETURNING *
        `;
        
        const result = await dbClient.query(query, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Hero not found' });
        }
        
        // Send log
        await sendLog(heroId, 2, 'hero_updated', { hero_id: heroId, updated_fields: allowedFields.filter(f => updates[f] !== undefined) });
        
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating hero:', error);
        res.status(500).json({ error: 'Failed to update hero' });
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

// POST /api/heroes/:heroId/xp - Add XP to hero
app.post('/api/heroes/:heroId/xp', async (req, res) => {
    try {
        const { heroId } = req.params;
        const { xp } = req.body;
        
        if (!xp || xp < 0) {
            return res.status(400).json({ error: 'Valid xp amount required' });
        }
        
        // Get current hero stats
        const selectQuery = 'SELECT * FROM hero_schema.HeroStats WHERE hero_id = $1';
        const selectResult = await dbClient.query(selectQuery, [heroId]);
        
        if (selectResult.rows.length === 0) {
            return res.status(404).json({ error: 'Hero not found' });
        }
        
        const hero = selectResult.rows[0];
        const newXp = hero.xp + xp;
        const newLevel = calculateLevel(newXp);
        
        // Update hero
        const updateQuery = `
            UPDATE hero_schema.HeroStats 
            SET xp = $1, level = $2, updated_at = NOW()
            WHERE hero_id = $3
            RETURNING *
        `;
        
        const updateResult = await dbClient.query(updateQuery, [newXp, newLevel, heroId]);
        
        // Send log
        await sendLog(heroId, 1, 'xp_gained', { hero_id: heroId, xp_gained: xp, new_xp: newXp, old_level: hero.level, new_level: newLevel });
        
        res.json(updateResult.rows[0]);
    } catch (error) {
        console.error('Error adding XP:', error);
        res.status(500).json({ error: 'Failed to add XP' });
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
