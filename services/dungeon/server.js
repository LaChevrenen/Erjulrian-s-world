const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');
const { createClient } = require('redis');
const { Client } = require('pg');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cors = require('cors');
const DungeonRun = require('./Dungeon');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3005;
const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/erjulrian_dungeon';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost:5672';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
    user: process.env.DB_USER || 'inventory_user',
    password: process.env.DB_PASSWORD || 'inventory_password',
    database: process.env.DB_NAME || 'erjulrian_db'
};

// Load Swagger documentation
const swaggerDocument = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// MongoDB connection
async function connectMongoDB() {
    try {
        await mongoose.connect(MONGO_URL);
        console.log('Connected to MongoDB');
    } catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        setTimeout(connectMongoDB, 5000);
    }
}

// Redis connection for caching
let redisClient;

async function connectRedis() {
    try {
        redisClient = createClient({ url: REDIS_URL });
        redisClient.on('error', (error) => {
            console.error('Redis error:', error);
        });
        await redisClient.connect();
        console.log('Connected to Redis');
    } catch (error) {
        console.error('Failed to connect to Redis:', error);
        setTimeout(connectRedis, 5000);
    }
}

async function getCachedDungeon(runId) {
    if (!redisClient?.isOpen) return null;
    try {
        const cached = await redisClient.get(`dungeon:${runId}`);
        return cached ? JSON.parse(cached) : null;
    } catch (error) {
        console.error('Failed to read dungeon cache:', error);
        return null;
    }
}

async function setCachedDungeon(runId, payload) {
    if (!redisClient?.isOpen) return;
    try {
        await redisClient.setEx(`dungeon:${runId}`, 300, JSON.stringify(payload));
    } catch (error) {
        console.error('Failed to write dungeon cache:', error);
    }
}

async function clearCachedDungeon(runId) {
    if (!redisClient?.isOpen) return;
    try {
        await redisClient.del(`dungeon:${runId}`);
    } catch (error) {
        console.error('Failed to clear dungeon cache:', error);
    }
}

// PostgreSQL connection for game data
let dbClient;
let monsterIdCache = [];

async function connectPostgres() {
    try {
        dbClient = new Client(dbConfig);
        await dbClient.connect();
        console.log('Connected to PostgreSQL (game data)');
        await refreshMonsterCache();
    } catch (error) {
        console.error('Failed to connect to PostgreSQL:', error);
        setTimeout(connectPostgres, 5000);
    }
}

async function refreshMonsterCache() {
    if (!dbClient) return;
    try {
        const result = await dbClient.query('SELECT id FROM game_schema.Monsters');
        monsterIdCache = result.rows.map(row => row.id);
    } catch (error) {
        console.error('Failed to refresh monster cache:', error);
    }
}

function pickRandomMonsterId() {
    if (!monsterIdCache.length) return null;
    const idx = Math.floor(Math.random() * monsterIdCache.length);
    return monsterIdCache[idx];
}

async function getMonsterWithLoot(monsterId) {
    if (!dbClient || !monsterId) return null;
    const monsterResult = await dbClient.query(
        'SELECT id, name, type, description, hp, att, def, regen FROM game_schema.Monsters WHERE id = $1',
        [monsterId]
    );

    if (monsterResult.rowCount === 0) return null;

    const lootResult = await dbClient.query(
        'SELECT artifact_id AS "artifactId", chance, amount FROM game_schema.MonsterLoot WHERE monster_id = $1',
        [monsterId]
    );

    const monster = monsterResult.rows[0];
    return {
        id: monster.id,
        name: monster.name,
        type: monster.type,
        description: monster.description,
        stats: {
            hp: monster.hp,
            att: monster.att,
            def: monster.def,
            regen: monster.regen
        },
        lootTable: lootResult.rows.map(l => ({
            artifactId: l.artifactId,
            chance: l.chance,
            amount: l.amount
        }))
    };
}

function computeHeroStats(heroSnapshot, equippedArtifacts) {
    const base = heroSnapshot?.stats || { hp: 0, att: 0, def: 0, regen: 0 };
    const artifacts = Array.isArray(equippedArtifacts) ? equippedArtifacts : [];

    const bonuses = artifacts.reduce(
        (acc, item) => {
            acc.hp += Number(item.hp_buff) || 0;
            acc.att += Number(item.att_buff) || 0;
            acc.def += Number(item.def_buff) || 0;
            acc.regen += Number(item.regen_buff) || 0;
            return acc;
        },
        { hp: 0, att: 0, def: 0, regen: 0 }
    );

    return {
        level: Number(heroSnapshot?.level) || 1,
        xp: Number(heroSnapshot?.xp) || 0,
        stats: {
            hp: (Number(base.hp) || 0) + bonuses.hp,
            att: (Number(base.att) || 0) + bonuses.att,
            def: (Number(base.def) || 0) + bonuses.def,
            regen: (Number(base.regen) || 0) + bonuses.regen
        }
    };
}

// RabbitMQ publisher setup
let channel;

async function setupRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        console.log('Connected to RabbitMQ');
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        setTimeout(setupRabbitMQ, 5000);
    }
}

// Helper function to publish events
async function publishEvent(queue, message) {
    if (channel) {
        try {
            await channel.assertQueue(queue, { durable: true });
            channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
        } catch (error) {
            console.error(`Failed to publish event to ${queue}:`, error);
        }
    }
}

// Helper function to generate random room type
function getRandomRoomType() {
    const types = ['combat', 'elite-combat', 'rest', 'boss'];
    return types[Math.floor(Math.random() * types.length)];
}

// Helper function to generate dungeon structure (3 floors x 5 rooms)
async function generateDungeonStructure() {
    if (!monsterIdCache.length) {
        await refreshMonsterCache();
    }

    const rooms = [];
    for (let floor = 0; floor < 3; floor++) {
        for (let room = 0; room < 5; room++) {
            const type = getRandomRoomType();
            const monsterId = type === 'rest' ? null : pickRandomMonsterId();
            rooms.push({
                floor,
                room,
                type,
                monsterId,
                visited: false
            });
        }
    }
    rooms[0].type = 'rest'; // First room is always rest (safe)
    rooms[0].visited = true;
    rooms[0].monsterId = null;
    return rooms;
}

// Helper function to generate available choices (2 different rooms)
function generateChoices(currentFloor, currentRoom, allRooms) {
    const choices = [];
    const maxFloor = 2; // 3 floors (0, 1, 2)
    const maxRoom = 4;  // 5 rooms (0-4)
    
    // Find next accessible rooms
    const nextRooms = [];
    
    // Option 1: Next room on same floor
    if (currentRoom < maxRoom) {
        const nextRoom = allRooms.find(r => r.floor === currentFloor && r.room === currentRoom + 1);
        if (nextRoom) {
            nextRooms.push(nextRoom);
        }
    } else if (currentFloor < maxFloor) {
        // Go to next floor, first room
        const nextFloorRoom = allRooms.find(r => r.floor === currentFloor + 1 && r.room === 0);
        if (nextFloorRoom) {
            nextRooms.push(nextFloorRoom);
        }
    }
    
    // Option 2: Previous room or skip ahead
    const alternatives = [];
    if (currentRoom > 0) {
        const prevRoom = allRooms.find(r => r.floor === currentFloor && r.room === currentRoom - 1);
        if (prevRoom && !prevRoom.visited) {
            alternatives.push(prevRoom);
        }
    }
    if (currentRoom + 2 <= maxRoom) {
        const skipRoom = allRooms.find(r => r.floor === currentFloor && r.room === currentRoom + 2);
        if (skipRoom) {
            alternatives.push(skipRoom);
        }
    }
    
    if (nextRooms.length > 0) {
        choices.push(nextRooms[0]);
    }
    
    if (alternatives.length > 0) {
        const alt = alternatives[Math.floor(Math.random() * alternatives.length)];
        if (!choices.find(c => c.floor === alt.floor && c.room === alt.room)) {
            choices.push(alt);
        }
    }
    
    // If we don't have 2 choices yet, add any unvisited room
    if (choices.length < 2) {
        const unvisited = allRooms.find(r => !r.visited && !choices.find(c => c.floor === r.floor && c.room === r.room));
        if (unvisited) {
            choices.push(unvisited);
        }
    }
    
    return choices.slice(0, 2); // Return max 2 choices
}

function buildDungeonResponse(dungeon) {
    return {
        runId: dungeon._id?.toString?.() || dungeon.runId?.toString?.() || dungeon._id || dungeon.runId,
        heroId: dungeon.heroId,
        status: dungeon.status,
        position: dungeon.position,
        rooms: dungeon.rooms
    };
}

// REST API Endpoints

// POST /api/dungeons/start - Start a dungeon run
app.post('/api/dungeons/start', async (req, res) => {
    try {
        const { heroId, heroStats, equippedArtifacts } = req.body;
        
        if (!heroId) {
            return res.status(400).json({ error: 'heroId is required' });
        }

        if (!heroStats || !heroStats.stats) {
            return res.status(400).json({ error: 'heroStats is required' });
        }

        if (!Array.isArray(equippedArtifacts)) {
            return res.status(400).json({ error: 'equippedArtifacts must be an array' });
        }

        const dungeonRooms = await generateDungeonStructure();
        const startingRoom = dungeonRooms[0];

        const dungeon = new DungeonRun({
            heroId,
            heroSnapshot: heroStats || null,
            equippedArtifacts: Array.isArray(equippedArtifacts) ? equippedArtifacts : [],
            startedAt: new Date(),
            status: 'in_progress',
            position: { floor: 0, room: 0 },
            rooms: dungeonRooms,
            visitedRooms: [startingRoom]
        });

        await dungeon.save();

        // Retrieve fresh copy to ensure ID is correct
        const savedDungeon = await DungeonRun.findById(dungeon._id);

        // Publish event
        await publishEvent('dungeon_queue', {
            type: 'dungeon_started',
            runId: savedDungeon._id || dungeon._id,
            heroId,
            timestamp: new Date()
        });

        const payload = buildDungeonResponse(savedDungeon || dungeon);
        await setCachedDungeon(payload.runId, payload);

        res.status(201).json(payload);
    } catch (error) {
        console.error('Error creating dungeon:', error);
        res.status(500).json({ error: 'Failed to create dungeon' });
    }
});

// GET /api/dungeons/:runId - Get dungeon run
app.get('/api/dungeons/:runId', async (req, res) => {
    try {
        const { runId } = req.params;
        
        const cachedDungeon = await getCachedDungeon(runId);
        if (cachedDungeon) {
            return res.json(cachedDungeon);
        }

        const dungeon = await DungeonRun.findById(runId);

        if (!dungeon) {
            return res.status(404).json({ error: 'Dungeon run not found' });
        }

        const payload = buildDungeonResponse(dungeon);
        await setCachedDungeon(runId, payload);

        res.json(payload);
    } catch (error) {
        console.error('Error fetching dungeon:', error);
        res.status(500).json({ error: 'Failed to fetch dungeon' });
    }
});

// GET /api/dungeons/:runId/choices - Get available room choices
app.get('/api/dungeons/:runId/choices', async (req, res) => {
    try {
        const { runId } = req.params;
        
        const cachedDungeon = await getCachedDungeon(runId);
        const dungeon = cachedDungeon || await DungeonRun.findById(runId);

        if (!dungeon) {
            return res.status(404).json({ error: 'Dungeon run not found' });
        }

        if (dungeon.status !== 'in_progress') {
            return res.status(400).json({ error: 'Dungeon run is not in progress' });
        }

        const choices = generateChoices(dungeon.position.floor, dungeon.position.room, dungeon.rooms);

        res.json({
            choices: choices.map(c => ({
                floor: c.floor,
                room: c.room,
                type: c.type
            }))
        });
    } catch (error) {
        console.error('Error fetching choices:', error);
        res.status(500).json({ error: 'Failed to fetch choices' });
    }
});

// POST /api/dungeons/:runId/choose - Choose next room
app.post('/api/dungeons/:runId/choose', async (req, res) => {
    try {
        const { runId } = req.params;
        const { choiceIndex } = req.body;

        if (choiceIndex === undefined || ![0, 1].includes(choiceIndex)) {
            return res.status(400).json({ error: 'choiceIndex must be 0 or 1' });
        }

        const dungeon = await DungeonRun.findById(runId);

        if (!dungeon) {
            return res.status(404).json({ error: 'Dungeon run not found' });
        }

        if (dungeon.status !== 'in_progress') {
            return res.status(400).json({ error: 'Dungeon run is not in progress' });
        }

        const choices = generateChoices(dungeon.position.floor, dungeon.position.room, dungeon.rooms);

        if (choiceIndex >= choices.length) {
            return res.status(400).json({ error: 'Invalid choice index' });
        }

        const chosenRoom = choices[choiceIndex];
        
        // Mark as visited
        chosenRoom.visited = true;
        
        // Update position
        dungeon.position = { floor: chosenRoom.floor, room: chosenRoom.room };
        
        // Add to visited rooms
        dungeon.visitedRooms.push(chosenRoom);
        
        await dungeon.save();

        const payload = buildDungeonResponse(dungeon);
        await setCachedDungeon(payload.runId, payload);

        // Publish event
        await publishEvent('dungeon_queue', {
            type: 'room_entered',
            runId: dungeon._id,
            heroId: dungeon.heroId,
            position: dungeon.position,
            roomType: chosenRoom.type,
            monsterId: chosenRoom.monsterId || null,
            timestamp: new Date()
        });

        // If combat room, build combat payload with monster + loot from DB
        if (['combat', 'elite-combat', 'boss'].includes(chosenRoom.type) && chosenRoom.monsterId) {
            try {
                const monster = await getMonsterWithLoot(chosenRoom.monsterId);
                if (!monster) {
                    return res.json({
                        position: dungeon.position,
                        roomType: chosenRoom.type
                    });
                }

                const computedHero = computeHeroStats(dungeon.heroSnapshot, dungeon.equippedArtifacts);

                await publishEvent('combat_queue', {
                    hero: {
                        heroId: dungeon.heroId,
                        level: computedHero.level,
                        xp: computedHero.xp,
                        stats: computedHero.stats
                    },
                    monster,
                    runId: dungeon._id,
                    room: { floor: chosenRoom.floor, room: chosenRoom.room, type: chosenRoom.type }
                });
            } catch (error) {
                console.error('Failed to trigger combat:', error);
            }
        }

        res.json({
            position: dungeon.position,
            roomType: chosenRoom.type
        });
    } catch (error) {
        console.error('Error choosing room:', error);
        res.status(500).json({ error: 'Failed to choose room' });
    }
});

// POST /api/dungeons/:runId/finish - Finish dungeon run
app.post('/api/dungeons/:runId/finish', async (req, res) => {
    try {
        const { runId } = req.params;
        
        const dungeon = await DungeonRun.findByIdAndUpdate(
            runId,
            {
                status: 'completed',
                finishedAt: new Date()
            },
            { new: true }
        );

        if (!dungeon) {
            return res.status(404).json({ error: 'Dungeon run not found' });
        }

        const payload = buildDungeonResponse(dungeon);
        await setCachedDungeon(payload.runId, payload);

        // Publish event
        await publishEvent('dungeon_queue', {
            type: 'dungeon_completed',
            runId: dungeon._id,
            heroId: dungeon.heroId,
            finishedAt: dungeon.finishedAt,
            timestamp: new Date()
        });

        res.json({
            message: `Dungeon finished with status: ${dungeon.status}`,
            runId: dungeon._id,
            heroId: dungeon.heroId,
            status: dungeon.status,
            finishedAt: dungeon.finishedAt
        });
    } catch (error) {
        console.error('Error finishing dungeon:', error);
        res.status(500).json({ error: 'Failed to finish dungeon' });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'dungeon-service' });
});

// Start server
async function start() {
    await connectMongoDB();
    await connectPostgres();
    await connectRedis();
    await setupRabbitMQ();
    
    app.listen(PORT, () => {
        console.log(`Dungeon service running on port ${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
}

start();
