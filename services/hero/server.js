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

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    user: process.env.DB_USER || 'hero_user',
    password: process.env.DB_PASSWORD || 'hero_password',
    database: process.env.DB_NAME || 'erjulrian'
};

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';

const swaggerDocument = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

let dbClient;
let rabbitChannel;

async function connectDB() {
    try {
        dbClient = new Client(dbConfig);
        await dbClient.connect();
        console.log('Connected to PostgreSQL database');
    } catch (error) {
        console.error('Failed to connect to database:', error);
        setTimeout(connectDB, 5000);
    }
}

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        rabbitChannel = await connection.createChannel();
        
        await rabbitChannel.assertQueue('log_queue', { durable: true });
        await rabbitChannel.assertQueue('hero_queue', { durable: true });
        
        console.log('Connected to RabbitMQ');
        
        startHeroConsumer();
        startHeroRPCListener();
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
        rabbitChannel.consume('hero_queue', async (msg) => {
            if (msg !== null) {
                const request = JSON.parse(msg.content.toString());
                
                try {
                    const { action, type, heroId, currentHp, maxHp, xpGained } = request;
                    
                    if (type === 'delete_hero') {
                        const deleteResult = await dbClient.query(
                            `DELETE FROM hero_schema.HeroStats WHERE hero_id = $1 RETURNING hero_id`,
                            [heroId]
                        );

                        if (deleteResult.rowCount > 0) {
                            await sendLog(heroId, 2, 'hero_deleted', { 
                                hero_id: heroId,
                                reason: request.reason || 'died'
                            });
                        }
                        
                        rabbitChannel.ack(msg);
                        return;
                    }
                    
                    if (type === 'reset_hp') {
                        const updateResult = await dbClient.query(
                            `UPDATE hero_schema.HeroStats
                             SET current_hp = base_hp,
                                 updated_at = NOW()
                             WHERE hero_id = $1
                             RETURNING hero_id, current_hp, base_hp`,
                            [heroId]
                        );

                        if (updateResult.rowCount > 0) {
                            const hero = updateResult.rows[0];
                            await sendLog(heroId, 1, 'hero_respawned', { 
                                hero_id: heroId, 
                                base_hp: hero.base_hp
                            });
                        }
                        
                        rabbitChannel.ack(msg);
                        return;
                    }
                    
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
        
        console.log('Hero consumer started');
    } catch (error) {
        console.error('Error starting hero consumer:', error);
    }
}

async function startHeroRPCListener() {
    if (!rabbitChannel) {
        console.error('Cannot start hero RPC listener: rabbitChannel is null');
        return;
    }
    
    try {
        await rabbitChannel.assertQueue('hero_rpc_queue', { durable: true });
        
        rabbitChannel.consume('hero_rpc_queue', async (msg) => {
            if (msg !== null) {
                try {
                    const request = JSON.parse(msg.content.toString());
                    const { type, heroId, current_hp } = request;
                    const correlationId = msg.properties.correlationId;
                    const replyTo = msg.properties.replyTo;
                    
                    let response;
                    
                    if (type === 'get_hero') {
                        const result = await dbClient.query(
                            'SELECT hero_id, base_hp, current_hp FROM hero_schema.HeroStats WHERE hero_id = $1',
                            [heroId]
                        );
                        
                        if (result.rowCount > 0) {
                            const hero = result.rows[0];
                            response = {
                                success: true,
                                hero_id: hero.hero_id,
                                base_hp: hero.base_hp,
                                current_hp: hero.current_hp
                            };
                        } else {
                            response = { success: false, error: 'Hero not found' };
                        }
                    } else if (type === 'update_hp') {
                        const result = await dbClient.query(
                            'UPDATE hero_schema.HeroStats SET current_hp = $1, updated_at = NOW() WHERE hero_id = $2 RETURNING hero_id, current_hp, base_hp',
                            [current_hp, heroId]
                        );
                        
                        if (result.rowCount > 0) {
                            const hero = result.rows[0];
                            response = {
                                success: true,
                                hero_id: hero.hero_id,
                                current_hp: hero.current_hp,
                                base_hp: hero.base_hp
                            };
                        } else {
                            response = { success: false, error: 'Hero not found' };
                        }
                    } else {
                        response = { success: false, error: 'Unknown RPC type' };
                    }
                    
                    if (replyTo) {
                        rabbitChannel.sendToQueue(replyTo, Buffer.from(JSON.stringify(response)), {
                            correlationId: correlationId
                        });
                    }
                    
                    rabbitChannel.ack(msg);
                } catch (error) {
                    console.error('Error processing hero RPC request:', error);
                    rabbitChannel.ack(msg);
                }
            }
        });
        
        console.log('Hero RPC listener started');
    } catch (error) {
        console.error('Error starting hero RPC listener:', error);
    }
}

async function sendLog(userId, level, eventType, payload) {
    if (!rabbitChannel) {
        console.warn('[SENDLOG] Channel not initialized, skipping log');
        return;
    }
    
    try {
        const logData = {
            user_id: userId,
            level: level,
            timestamp: new Date().toISOString(),
            service: 'hero',
            eventType: eventType,
            payload: payload
        };
        
        await rabbitChannel.assertQueue('log_queue', { durable: true });
        rabbitChannel.sendToQueue('log_queue', Buffer.from(JSON.stringify(logData)), { persistent: true });
        console.log(`[SENDLOG] Log sent: ${eventType}`);
    } catch (error) {
        console.error('[SENDLOG] Error:', error);
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


function isUuid(value) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

app.post('/api/heroes', async (req, res) => {
    try {
        const { userId, name } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const heroName = name || `Hero_${Date.now()}`;

        const query = `
            INSERT INTO hero_schema.HeroStats (user_id, name, level, xp, base_hp, current_hp, base_att, base_def, base_regen, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
            RETURNING hero_id, user_id, name
        `;
        
        
        const values = [
            userId,
            heroName,
            1,
            0,
            50,
            50,
            4,
            1,
            1
        ];
        
        const result = await dbClient.query(query, values);
        const heroId = result.rows[0].hero_id;
        
        await sendLog(userId, 1, 'hero_created', { hero_id: heroId, user_id: userId, name: heroName, initial_stats: { hp: 50, att: 4, def: 1, regen: 1 } });
        await publishHeroEvent('hero_created', { heroId, userId, name: heroName });
        
        res.status(201).json({ heroId, userId, name: heroName });
    } catch (error) {
        console.error('Error creating hero:', error);
        res.status(500).json({ error: 'Failed to create hero' });
    }
});

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

app.get('/api/heroes/:heroId', async (req, res) => {
    try {
        const { heroId } = req.params;
        if (!isUuid(heroId)) {
            return res.status(400).json({ error: 'Invalid heroId format' });
        }
        const query = 'SELECT * FROM hero_schema.HeroStats WHERE hero_id = $1';
        const result = await dbClient.query(query, [heroId]);
        
        if (result.rows.length === 0) {
            await sendLog(heroId, 2, 'hero_not_found', { hero_id: heroId });
            return res.status(404).json({ error: 'Hero not found' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching hero:', error);
        res.status(500).json({ error: 'Failed to fetch hero' });
    }
});

app.put('/api/heroes/:heroId', async (req, res) => {
    try {
        const { heroId } = req.params;
        const { current_hp, xp } = req.body;

        if (!isUuid(heroId)) {
            return res.status(400).json({ error: 'Invalid heroId format' });
        }

        const updates = [];
        const values = [];
        let paramIndex = 1;

        if (current_hp !== undefined) {
            updates.push(`current_hp = $${paramIndex}`);
            values.push(current_hp);
            paramIndex++;
        }

        if (xp !== undefined) {
            updates.push(`xp = $${paramIndex}`);
            values.push(xp);
            paramIndex++;
        }

        if (updates.length === 0) {
            await sendLog(heroId, 2, 'hero_update_failed', { hero_id: heroId, reason: 'no_fields' });
            return res.status(400).json({ error: 'No fields to update' });
        }

        updates.push(`updated_at = NOW()`);
        values.push(heroId);

        const query = `
            UPDATE hero_schema.HeroStats 
            SET ${updates.join(', ')}
            WHERE hero_id = $${paramIndex}
            RETURNING *
        `;

        const result = await dbClient.query(query, values);

        if (result.rows.length === 0) {
            await sendLog(heroId, 2, 'hero_update_failed', { hero_id: heroId, reason: 'not_found' });
            return res.status(404).json({ error: 'Hero not found' });
        }
        
        await sendLog(heroId, 1, 'hero_updated', { 
            hero_id: heroId, 
            updated_fields: { current_hp, xp },
            new_hp: result.rows[0].current_hp 
        });

        res.json(result.rows[0]);
    } catch (error) {
        console.error('Error updating hero:', error);
        res.status(500).json({ error: 'Failed to update hero' });
    }
});

app.delete('/api/heroes/:heroId', async (req, res) => {
    try {
        const { heroId } = req.params;
        const query = 'DELETE FROM hero_schema.HeroStats WHERE hero_id = $1 RETURNING hero_id';
        const result = await dbClient.query(query, [heroId]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Hero not found' });
        }
        
        await sendLog(heroId, 2, 'hero_deleted', { hero_id: heroId });
        
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting hero:', error);
        res.status(500).json({ error: 'Failed to delete hero' });
    }
});


app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'hero-service' });
});

async function start() {
    await connectDB();
    await connectRabbitMQ();
    
    app.listen(PORT, () => {
        console.log(`Hero service running on port ${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
}

start();
