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
    user: process.env.DB_USER || 'dungeon_user',
    password: process.env.DB_PASSWORD || 'dungeon_password',
    database: process.env.DB_NAME || 'erjulrian_db'
};

// game constants
const FLOORS = 3;
const ROOMS_PER_FLOOR = 5;
const maxFloor = FLOORS - 1;
const maxRoom = ROOMS_PER_FLOOR - 1;
const OPTION_NUMBER = 2;

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
let normalMonsterCache = [];    // Regular monsters (not boss)
let bossMonsterCache = [];       // Boss monsters (type 'boss')
let finalBossMonsterCache = [];  // Final boss monsters (type 'boss_final')

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
        // Get normal monsters (not boss types)
        const normalResult = await dbClient.query(
            "SELECT id FROM game_schema.Monsters WHERE type NOT IN ('boss', 'boss_final')"
        );
        normalMonsterCache = normalResult.rows.map(row => row.id);
        
        // Get boss monsters (for elite-combat rooms)
        const bossResult = await dbClient.query(
            "SELECT id FROM game_schema.Monsters WHERE type = 'boss'"
        );
        bossMonsterCache = bossResult.rows.map(row => row.id);
        
        // Get final boss monsters (for final room only)
        const finalBossResult = await dbClient.query(
            "SELECT id FROM game_schema.Monsters WHERE type = 'boss_final'"
        );
        finalBossMonsterCache = finalBossResult.rows.map(row => row.id);
        
        console.log(`Monster cache refreshed: ${normalMonsterCache.length} normal, ${bossMonsterCache.length} boss, ${finalBossMonsterCache.length} final boss`);
    } catch (error) {
        console.error('Failed to refresh monster cache:', error);
    }
}

function pickRandomNormalMonsterId() {
    if (!normalMonsterCache.length) return null;
    const idx = Math.floor(Math.random() * normalMonsterCache.length);
    return normalMonsterCache[idx];
}

function pickRandomBossMonsterId() {
    if (!bossMonsterCache.length) return null;
    const idx = Math.floor(Math.random() * bossMonsterCache.length);
    return bossMonsterCache[idx];
}

function pickRandomFinalBossMonsterId() {
    if (!finalBossMonsterCache.length) return null;
    const idx = Math.floor(Math.random() * finalBossMonsterCache.length);
    return finalBossMonsterCache[idx];
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

// RabbitMQ publisher setup
let channel;

async function setupRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        console.log('Connected to RabbitMQ');
        
        // Start consuming combat results
        startCombatResultConsumer();
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

// Combat result consumer - updates dungeon hero snapshot with damage taken
async function startCombatResultConsumer() {
    if (!channel) {
        console.error('Cannot start combat result consumer: channel is null');
        return;
    }

    try {
        console.log('Starting combat result consumer...');
        const resultQueue = 'combat_result_queue';
        await channel.assertQueue(resultQueue, { durable: true });

        channel.consume(resultQueue, async (msg) => {
            if (msg !== null) {
                try {
                    const battleResult = JSON.parse(msg.content.toString());
                    console.log('Combat result received:', battleResult);

                    const runId = battleResult.runId;
                    const heroId = battleResult.heroId || battleResult.hero?.heroId;

                    if (!runId || !heroId) {
                        console.warn('Combat result missing runId or heroId');
                        channel.ack(msg);
                        return;
                    }

                    // Find dungeon run
                    const dungeon = await DungeonRun.findById(runId);
                    if (!dungeon) {
                        console.warn(`Dungeon run ${runId} not found`);
                        channel.ack(msg);
                        return;
                    }

                    console.log(`Combat result received for dungeon ${runId}: ${battleResult.result}`);
                    
                    // Invalidate cache
                    await clearCachedDungeon(runId);

                    channel.ack(msg);
                } catch (error) {
                    console.error('Error processing combat result:', error);
                    channel.ack(msg);
                }
            }
        });

        console.log('Combat result consumer started');
    } catch (error) {
        console.error('Failed to start combat result consumer:', error);
    }
}

// Helper function to generate random room type
function getRandomRoomType() {
    const types = ['combat', 'elite-combat', 'rest', 'boss'];
    return types[Math.floor(Math.random() * types.length)];
}

// Helper function to generate dungeon structure (3 floors x 5 rooms)
async function generateDungeonStructure() {
    if (!normalMonsterCache.length) {
        await refreshMonsterCache();
    }

    const rooms = [];
    
    // Generate all rooms with proper types
    for (let floor = 0; floor < FLOORS; floor++) {
        for (let room = 0; room < ROOMS_PER_FLOOR; room++) {
            for(let choiceNumber = 0; choiceNumber < OPTION_NUMBER; choiceNumber++)
            {
                let type;
                let monsterId = null;
            
                // First room is always rest
                if (floor === 0 && room === 0) {
                    type = 'rest';
                }
                // Last room of last floor is final boss (use FINAL BOSS monster)
                else if (floor === FLOORS - 1 && room === ROOMS_PER_FLOOR - 1) {
                    type = 'boss';
                    monsterId = pickRandomFinalBossMonsterId();
                }
                // Last room of other floors is elite combat (use regular boss)
                else if (room === ROOMS_PER_FLOOR - 1) {
                    type = 'elite-combat';
                    monsterId = pickRandomBossMonsterId();
                }
                // Middle rooms: mix of combat and rest (use normal monsters)
                else {
                    // 75% combat, 25% rest
                    type = Math.random() < 0.75 ? 'combat' : 'rest';
                    if (type === 'combat') {
                        monsterId = pickRandomNormalMonsterId();
                    }
                }
            
                rooms.push({
                    floor,
                    room,
                    choiceNumber,
                    type,
                    monsterId,
                    visited: false
                });
            }
        }
    }
    
    // Mark starting room as visited
    rooms[0].visited = true;
    return rooms;
}

// Helper function to generate available choices (2 variants of next room)
// Linear progression: always move to next room sequentially
// Choices differ by TYPE (combat vs rest) or MONSTER for boss rooms
function getChoices(currentFloor, currentRoom, allRooms) {    
    // Calculate next room position (linear progression)
    let nextFloor = currentFloor;
    let nextRoom = currentRoom + 1;
    
    // If at end of floor, go to next floor first room
    if (nextRoom > maxRoom) {
        nextFloor++;
        nextRoom = 0;
    }
    
    // Get the base room template
    const choices = allRooms.filter(r => r.floor === nextFloor && r.room === nextRoom);
    if (choices.length === 0) return [];
    
    
    return choices;
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
            equippedArtifacts: Array.isArray(equippedArtifacts) ? equippedArtifacts : [],
            startedAt: new Date(),
            status: 'in_progress',
            position: { floor: 0, room: 0 },
            rooms: dungeonRooms,
            visitedRooms: [startingRoom]
        });

        // Save data into MongoDB
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

        const choices = getChoices(dungeon.position.floor, dungeon.position.room, dungeon.rooms);

        res.json({
            choices: choices.map(c => ({
                floor: c.floor,
                room: c.room,
                type: c.type,
                monsterId: c.monsterId || null
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
        const { choiceIndex, heroStats } = req.body;

        if (choiceIndex === undefined || ![0, 1].includes(choiceIndex)) {
            return res.status(400).json({ error: 'choiceIndex must be 0 or 1' });
        }

        if (!heroStats || typeof heroStats.hp !== 'number' || typeof heroStats.current_hp !== 'number') {
            return res.status(400).json({ error: 'heroStats with hp, current_hp, att, def, regen is required' });
        }

        const dungeon = await DungeonRun.findById(runId);

        if (!dungeon) {
            return res.status(404).json({ error: 'Dungeon run not found' });
        }

        if (dungeon.status !== 'in_progress') {
            return res.status(400).json({ error: 'Dungeon run is not in progress' });
        }

        const choices = getChoices(dungeon.position.floor, dungeon.position.room, dungeon.rooms);

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

                await publishEvent('combat_queue', {
                    hero: {
                        heroId: dungeon.heroId,
                        level: 1,
                        xp: 0,
                        stats: heroStats
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
