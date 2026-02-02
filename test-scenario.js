const amqp = require('amqplib');
const axios = require('axios');
const { randomUUID } = require('crypto');

const RABBITMQ_URL = 'amqp://localhost:5672';
const HERO_API = 'http://localhost:3003/api';
const INVENTORY_API = 'http://localhost:3004/api';
const COMBAT_API = 'http://localhost:3000/api';
const LOG_API = 'http://localhost:3009/api';

let channel;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectRabbitMQ() {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    console.log('✓ Connected to RabbitMQ\n');
}

async function sendToQueue(queue, message) {
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
    console.log(`📤 Sent to ${queue}:`, message);
}

async function runScenario() {
    console.log('🎮 Starting Erjulrian\'s World Test Scenario\n');
    console.log('=' .repeat(60));
    
    const userId = randomUUID(); // Use UUID for user_id
    let heroId = null;
    
    try {
        // Step 1: Create Hero via REST API
        console.log('\n📍 STEP 1: Creating Hero');
        console.log('-'.repeat(60));
        const heroResponse = await axios.post(`${HERO_API}/heroes`, {
            userId: userId
        });
        console.log('✓ Hero created:', heroResponse.data);
        heroId = heroResponse.data.heroId;
        await sleep(1000);
        
        // Step 2: Create Inventory via REST API
        console.log('\n📍 STEP 2: Creating Inventory');
        console.log('-'.repeat(60));
        const inventoryResponse = await axios.post(`${INVENTORY_API}/inventory`, {
            heroId: heroId,
            gold: 100
        });
        console.log('✓ Inventory created:', inventoryResponse.data);
        await sleep(1000);
        
        // Step 3: Add XP via RabbitMQ
        console.log('\n📍 STEP 3: Adding XP via hero_queue');
        console.log('-'.repeat(60));
        await sendToQueue('hero_queue', {
            action: 'add_xp',
            heroId: heroId,
            xp: 250
        });
        await sleep(1000);
        
        // Step 4: Add gold via RabbitMQ
        console.log('\n📍 STEP 4: Adding gold via inventory_queue');
        console.log('-'.repeat(60));
        await sendToQueue('inventory_queue', {
            action: 'add_gold',
            heroId: heroId,
            gold: 50
        });
        await sleep(1000);
        
        // Step 5: Add item via RabbitMQ
        console.log('\n📍 STEP 5: Adding item via inventory_queue');
        console.log('-'.repeat(60));
        await sendToQueue('inventory_queue', {
            action: 'add_item',
            heroId: heroId,
            artifact: {
                artifactId: randomUUID(),
                quantity: 1
            }
        });
        await sleep(1000);
        
        // Step 6: Update hero stats via RabbitMQ
        console.log('\n📍 STEP 6: Updating hero stats via hero_queue');
        console.log('-'.repeat(60));
        await sendToQueue('hero_queue', {
            action: 'update_stats',
            heroId: heroId,
            stats: {
                att: 10,
                def: 5
            }
        });
        await sleep(1000);
        
        // Step 7: Simulate combat (POST to combat service)
        console.log('\n📍 STEP 7: Starting combat');
        console.log('-'.repeat(60));
        try {
            const combatResponse = await axios.post(`${COMBAT_API}/combat/start`, {
                heroId: heroId,
                monsterId: 'goblin-1'
            });
            console.log('✓ Combat started:', combatResponse.data);
        } catch (error) {
            console.log('⚠ Combat endpoint may not be fully implemented:', error.response?.status);
        }
        await sleep(1000);
        
        // Step 8: Check Hero Stats
        console.log('\n📍 STEP 8: Checking Hero Stats');
        console.log('-'.repeat(60));
        const heroStatsResponse = await axios.get(`${HERO_API}/heroes/${heroId}`);
        console.log('✓ Hero stats:', heroStatsResponse.data);
        await sleep(500);
        
        // Step 9: Check Inventory
        console.log('\n📍 STEP 9: Checking Inventory');
        console.log('-'.repeat(60));
        const inventoryCheckResponse = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        console.log('✓ Inventory:', inventoryCheckResponse.data);
        await sleep(500);
        
        // Step 10: Check Logs
        console.log('\n📍 STEP 10: Checking Logs');
        console.log('-'.repeat(60));
        const logsResponse = await axios.get(`${LOG_API}/logs?limit=20`);
        console.log(`✓ Found ${logsResponse.data.length} logs`);
        
        // Filter logs for this hero
        const heroLogs = logsResponse.data.filter(log => 
            log.payload?.hero_id === heroId || log.user_id === heroId
        );
        console.log(`✓ Logs related to hero ${heroId}:`, heroLogs.length);
        heroLogs.forEach((log, idx) => {
            console.log(`  ${idx + 1}. [${log.service}] ${log.event_type} - Level: ${log.level}`);
        });
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Test scenario completed successfully!');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('\n❌ Error during test:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
    
    process.exit(0);
}

async function main() {
    await connectRabbitMQ();
    await runScenario();
}

main().catch(console.error);
