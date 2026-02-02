const express = require('express');
const mongoose = require('mongoose');
const amqp = require('amqplib');
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
function generateDungeonStructure() {
    const rooms = [];
    for (let floor = 0; floor < 3; floor++) {
        for (let room = 0; room < 5; room++) {
            rooms.push({
                floor,
                room,
                type: getRandomRoomType(),
                monsterId: null,
                visited: false
            });
        }
    }
    rooms[0].type = 'rest'; // First room is always rest (safe)
    rooms[0].visited = true;
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

// REST API Endpoints

// POST /api/dungeons/start - Start a dungeon run
app.post('/api/dungeons/start', async (req, res) => {
    try {
        const { heroId } = req.body;
        
        if (!heroId) {
            return res.status(400).json({ error: 'heroId is required' });
        }

        const dungeonRooms = generateDungeonStructure();
        const startingRoom = dungeonRooms[0];

        const dungeon = new DungeonRun({
            heroId,
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

        res.status(201).json({
            runId: (savedDungeon._id || dungeon._id).toString(),
            heroId: dungeon.heroId,
            status: dungeon.status,
            position: dungeon.position,
            rooms: dungeon.rooms
        });
    } catch (error) {
        console.error('Error creating dungeon:', error);
        res.status(500).json({ error: 'Failed to create dungeon' });
    }
});

// GET /api/dungeons/:runId - Get dungeon run
app.get('/api/dungeons/:runId', async (req, res) => {
    try {
        const { runId } = req.params;
        
        const dungeon = await DungeonRun.findById(runId);

        if (!dungeon) {
            return res.status(404).json({ error: 'Dungeon run not found' });
        }

        res.json({
            runId: dungeon._id,
            heroId: dungeon.heroId,
            status: dungeon.status,
            position: dungeon.position,
            rooms: dungeon.rooms
        });
    } catch (error) {
        console.error('Error fetching dungeon:', error);
        res.status(500).json({ error: 'Failed to fetch dungeon' });
    }
});

// GET /api/dungeons/:runId/choices - Get available room choices
app.get('/api/dungeons/:runId/choices', async (req, res) => {
    try {
        const { runId } = req.params;
        
        const dungeon = await DungeonRun.findById(runId);

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

        // Publish event
        await publishEvent('dungeon_queue', {
            type: 'room_entered',
            runId: dungeon._id,
            heroId: dungeon.heroId,
            position: dungeon.position,
            roomType: chosenRoom.type,
            timestamp: new Date()
        });

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
    await setupRabbitMQ();
    
    app.listen(PORT, () => {
        console.log(`Dungeon service running on port ${PORT}`);
        console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
}

start();
