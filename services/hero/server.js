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
        const queue = 'log_queue';
        await rabbitChannel.assertQueue(queue, { durable: true });
        console.log('Connected to RabbitMQ');
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        setTimeout(connectRabbitMQ, 5000);
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

// XP calculation for leveling
function calculateLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100)) + 1;
}

// REST API Endpoints

// POST /api/heroes - Create a new hero
app.post('/api/heroes', async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const query = `
            INSERT INTO hero_schema.HeroStats (hero_id, level, xp, base_hp, base_att, base_def, base_regen, artifact_slot_1, artifact_slot_2, artifact_slot_3, artifact_slot_4, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8::uuid, $9::uuid, $10::uuid, $11::uuid, NOW())
            RETURNING hero_id
        `;
        
        // Starting stats
        const values = [
            userId,      // hero_id = user_id
            1,           // level
            0,           // xp
            20,          // base_hp
            4,           // base_att
            1,           // base_def
            1,           // base_regen
            null,        // artifact_slot_1 (UUID)
            null,        // artifact_slot_2 (UUID)
            null,        // artifact_slot_3 (UUID)
            null         // artifact_slot_4 (UUID)
        ];
        
        const result = await dbClient.query(query, values);
        
        // Send log
        await sendLog(userId, 1, 'hero_created', { hero_id: userId, initial_stats: { hp: 20, att: 4, def: 1, regen: 1 } });
        
        res.status(201).json({ heroId: result.rows[0].hero_id });
    } catch (error) {
        console.error('Error creating hero:', error);
        res.status(500).json({ error: 'Failed to create hero' });
    }
});

// GET /api/heroes/:heroId - Get hero stats
app.get('/api/heroes/:heroId', async (req, res) => {
    try {
        const { heroId } = req.params;
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

// PUT /api/heroes/:heroId - Update hero stats
app.put('/api/heroes/:heroId', async (req, res) => {
    try {
        const { heroId } = req.params;
        const updates = req.body;
        
        // Build dynamic update query
        const fields = [];
        const values = [];
        let paramIndex = 1;
        
        const allowedFields = ['level', 'xp', 'base_hp', 'base_att', 'base_def', 'base_regen', 
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
