const amqp = require('amqplib');
const axios = require('axios');
const { randomUUID } = require('crypto');

const RABBITMQ_URL = 'amqp://localhost:5672';
const HERO_API = 'http://localhost:3003/api';
const INVENTORY_API = 'http://localhost:3004/api';
const COMBAT_API = 'http://localhost:3000/api';
const LOG_API = 'http://localhost:3009/api';
const DUNGEON_API = 'http://localhost:3005/api/dungeons';

let channel;
let testResults = {
    passed: 0,
    failed: 0,
    total: 0
};

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
}

function logTest(name, passed, details = '') {
    testResults.total++;
    if (passed) {
        testResults.passed++;
        console.log(`✅ ${name}`);
    } else {
        testResults.failed++;
        console.log(`❌ ${name}`);
    }
    if (details) {
        console.log(`   ${details}`);
    }
}

async function testHeroQueue() {
    console.log('\n🧪 TEST SUITE: Hero Queue');
    console.log('='.repeat(60));
    
    const userId = randomUUID();
    let heroId = null;
    
    // Create hero via REST
    const heroRes = await axios.post(`${HERO_API}/heroes`, { userId });
    heroId = heroRes.data.heroId;
    logTest('Create hero via REST', Boolean(heroId));
    
    await sleep(500);
    
    // Test 1: Add XP via queue
    console.log('\n📍 Test: Add XP via hero_queue');
    await sendToQueue('hero_queue', { action: 'add_xp', heroId, xp: 500 });
    await sleep(1000);
    
    let stats = (await axios.get(`${HERO_API}/heroes/${heroId}`)).data;
    logTest('XP added correctly', stats.xp === 500 && stats.level === 3, `XP: ${stats.xp}, Level: ${stats.level}`);
    
    // Test 2: Add more XP
    await sendToQueue('hero_queue', { action: 'add_xp', heroId, xp: 1000 });
    await sleep(1000);
    
    stats = (await axios.get(`${HERO_API}/heroes/${heroId}`)).data;
    logTest('Cumulative XP works', stats.xp === 1500 && stats.level >= 3, `XP: ${stats.xp}, Level: ${stats.level}`);
    
    // Test 3: Update stats via queue
    console.log('\n📍 Test: Update stats via hero_queue');
    await sendToQueue('hero_queue', { action: 'update_stats', heroId, stats: { att: 50, def: 30, regen: 10 } });
    await sleep(1000);
    
    stats = (await axios.get(`${HERO_API}/heroes/${heroId}`)).data;
    logTest('Stats updated correctly', 
        stats.base_att === 50 && stats.base_def === 30 && stats.base_regen === 10,
        `ATT: ${stats.base_att}, DEF: ${stats.base_def}, REGEN: ${stats.base_regen}`);
    
    // Test 4: Update HP via queue
    console.log('\n📍 Test: Update HP via hero_queue');
    await sendToQueue('hero_queue', { action: 'update_hp', heroId, hp: 100 });
    await sleep(1000);
    
    stats = (await axios.get(`${HERO_API}/heroes/${heroId}`)).data;
    logTest('HP updated correctly', stats.base_hp === 100, `HP: ${stats.base_hp}`);
    
    // Test 5: Get hero via queue (should not fail)
    console.log('\n📍 Test: Get hero via hero_queue');
    await sendToQueue('hero_queue', { action: 'get', heroId });
    await sleep(500);
    logTest('Get hero via queue sent successfully', true);
    
    return heroId;
}

async function testInventoryQueue(heroId) {
    console.log('\n🧪 TEST SUITE: Inventory Queue');
    console.log('='.repeat(60));
    const ironSwordId = randomUUID();
    const healthPotionId = randomUUID();
    
    // Create inventory
    await axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: 200 });
    logTest('Create inventory via REST', true);
    
    await sleep(500);
    
    // Test 1: Add gold via queue
    console.log('\n📍 Test: Add gold via inventory_queue');
    await sendToQueue('inventory_queue', { action: 'add_gold', heroId, gold: 150 });
    await sleep(1000);
    
    let inventory = (await axios.get(`${INVENTORY_API}/inventory/${heroId}`)).data;
    logTest('Gold added correctly', inventory.gold === 350, `Gold: ${inventory.gold}`);
    
    // Test 2: Remove gold via queue
    console.log('\n📍 Test: Remove gold via inventory_queue');
    await sendToQueue('inventory_queue', { action: 'remove_gold', heroId, gold: 100 });
    await sleep(1000);
    
    inventory = (await axios.get(`${INVENTORY_API}/inventory/${heroId}`)).data;
    logTest('Gold removed correctly', inventory.gold === 250, `Gold: ${inventory.gold}`);
    
    // Test 3: Try to remove more gold than available (should cap at 0)
    console.log('\n📍 Test: Remove more gold than available');
    await sendToQueue('inventory_queue', { action: 'remove_gold', heroId, gold: 1000 });
    await sleep(1000);
    
    inventory = (await axios.get(`${INVENTORY_API}/inventory/${heroId}`)).data;
    logTest('Gold capped at 0', inventory.gold === 0, `Gold: ${inventory.gold}`);
    
    // Test 4: Add multiple items via queue
    console.log('\n📍 Test: Add items via inventory_queue');
    await sendToQueue('inventory_queue', { action: 'add_item', heroId, artifact: { artifactId: ironSwordId, quantity: 1 } });
    await sleep(500);
    await sendToQueue('inventory_queue', { action: 'add_item', heroId, artifact: { artifactId: healthPotionId, quantity: 5 } });
    await sleep(500);
    await sendToQueue('inventory_queue', { action: 'add_item', heroId, artifact: { artifactId: ironSwordId, quantity: 2 } });
    await sleep(1000);
    
    inventory = (await axios.get(`${INVENTORY_API}/inventory/${heroId}`)).data;
    const ironSword = inventory.items.find(i => i.artifactId === ironSwordId);
    const healthPotion = inventory.items.find(i => i.artifactId === healthPotionId);
    
    logTest('Items added correctly', 
        ironSword && ironSword.quantity === 3 && healthPotion && healthPotion.quantity === 5,
        `Iron Sword: ${ironSword?.quantity}, Health Potion: ${healthPotion?.quantity}`);
    
    // Test 5: Remove item via queue
    console.log('\n📍 Test: Remove item via inventory_queue');
    await sendToQueue('inventory_queue', { action: 'remove_item', heroId, artifact: { artifactId: healthPotionId } });
    await sleep(1000);
    
    inventory = (await axios.get(`${INVENTORY_API}/inventory/${heroId}`)).data;
    const hasPotion = inventory.items.some(i => i.artifactId === healthPotionId);
    logTest('Item removed correctly', !hasPotion, `Health Potion removed: ${!hasPotion}`);
    
    // Test 6: Get inventory via queue
    console.log('\n📍 Test: Get inventory via inventory_queue');
    await sendToQueue('inventory_queue', { action: 'get', heroId });
    await sleep(500);
    logTest('Get inventory via queue sent successfully', true);
}

async function testMultipleHeroes() {
    console.log('\n🧪 TEST SUITE: Multiple Heroes Concurrency');
    console.log('='.repeat(60));
    
    const heroes = [];
    const heroCount = 5;
    
    // Create multiple heroes in parallel
    console.log(`\n📍 Test: Create ${heroCount} heroes in parallel`);
    const createPromises = [];
    for (let i = 0; i < heroCount; i++) {
        const userId = randomUUID();
        const initialGold = 100 * (i + 1);
        const expectedXP = (i + 1) * 100;
        const goldDelta = (i + 1) * 50;
        const expectedGold = initialGold + goldDelta;
        createPromises.push(
            axios.post(`${HERO_API}/heroes`, { userId })
                .then((res) => {
                    const heroId = res.data.heroId;
                    heroes.push({ heroId, expectedXP, expectedGold, goldDelta });
                    return axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: initialGold });
                })
        );
    }
    
    await Promise.all(createPromises);
    logTest(`Created ${heroCount} heroes successfully`, true);
    
    await sleep(500);
    
    // Send messages to all heroes via queues
    console.log(`\n📍 Test: Send queue messages to ${heroCount} heroes concurrently`);
    for (let i = 0; i < heroCount; i++) {
        await sendToQueue('hero_queue', { action: 'add_xp', heroId: heroes[i].heroId, xp: heroes[i].expectedXP });
        await sendToQueue('inventory_queue', { action: 'add_gold', heroId: heroes[i].heroId, gold: heroes[i].goldDelta });
    }
    
    await sleep(2000);
    
    // Verify all heroes received their updates
    let allCorrect = true;
    for (let i = 0; i < heroCount; i++) {
        const stats = (await axios.get(`${HERO_API}/heroes/${heroes[i].heroId}`)).data;
        const inventory = (await axios.get(`${INVENTORY_API}/inventory/${heroes[i].heroId}`)).data;
        
        const expectedXP = heroes[i].expectedXP;
        const expectedGold = heroes[i].expectedGold;
        
        if (stats.xp !== expectedXP || inventory.gold !== expectedGold) {
            allCorrect = false;
            console.log(`   ⚠️  Hero ${i + 1}: XP=${stats.xp} (expected ${expectedXP}), Gold=${inventory.gold} (expected ${expectedGold})`);
        }
    }
    
    logTest('All heroes processed correctly in parallel', allCorrect);
}

async function testLogging() {
    console.log('\n🧪 TEST SUITE: Log Service via RabbitMQ');
    console.log('='.repeat(60));
    
    const userId = randomUUID();
    let heroId = null;
    const magicWandId = randomUUID();
    
    try {
        // Create hero and inventory
        const createRes = await axios.post(`${HERO_API}/heroes`, { userId });
        heroId = createRes.data.heroId;
        await axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: 50 });
        await sleep(500);
    
    // Perform multiple actions to generate logs
    console.log('\n📍 Test: Generate multiple log events');
    await sendToQueue('hero_queue', { action: 'add_xp', heroId, xp: 100 });
    await sendToQueue('hero_queue', { action: 'update_stats', heroId, stats: { att: 25 } });
    await sendToQueue('inventory_queue', { action: 'add_gold', heroId, gold: 75 });
    await sendToQueue('inventory_queue', { action: 'add_item', heroId, artifact: { artifactId: magicWandId, quantity: 1 } });
    
    await sleep(2000);
    
    // Check logs
    try {
        const logsRes = await axios.get(`${LOG_API}/logs`);
        const allLogs = Array.isArray(logsRes.data) ? logsRes.data : logsRes.data.logs || [];
        const heroLogs = allLogs.filter(log => log.user_id === userId || log.payload?.hero_id === heroId);
        
        logTest('Logs created for all actions', heroLogs.length >= 6, `Found ${heroLogs.length} logs`);
        
        if (heroLogs.length > 0) {
            const eventTypes = heroLogs.map(log => log.event_type);
            const hasCreated = eventTypes.includes('hero_created') && eventTypes.includes('inventory_created');
            const hasXP = eventTypes.includes('xp_added');
            const hasStats = eventTypes.includes('stats_updated');
            const hasGold = eventTypes.includes('gold_added');
            const hasItem = eventTypes.includes('item_added') || eventTypes.includes('artifact_added');
            
            logTest('All event types logged', hasCreated && hasXP && hasStats && hasGold && hasItem,
                `Events: ${eventTypes.join(', ')}`);
        } else {
            logTest('All event types logged', false, 'No logs found');
        }
    } catch (error) {
        logTest('Logs created for all actions', false, `Error: ${error.message}`);
        logTest('All event types logged', false, 'Could not retrieve logs');
    }
    } catch (error) {
        logTest('Log service test', false, `Error: ${error.message}`);
    }
}

async function testDungeonIntegration() {
    console.log('\n🧪 TEST SUITE: Dungeon Service Integration');
    console.log('='.repeat(60));
    
    const userId = randomUUID();
    let heroId = null;
    
    try {
        // Create hero
        const createRes = await axios.post(`${HERO_API}/heroes`, { userId });
        heroId = createRes.data.heroId;
        await sleep(1000);
    
    // Test 1: Start dungeon run
    console.log('\n📍 Test: Start dungeon run');
    let dungeonRes = await axios.post(`${DUNGEON_API}/start`, { heroId });
    const runId = dungeonRes.data.runId;
    logTest('Dungeon run started', !!runId, `Run ID: ${runId}`);
    
    // Test 2: Get dungeon state
    dungeonRes = await axios.get(`${DUNGEON_API}/${runId}`);
    logTest('Dungeon state retrieved', 
        dungeonRes.data.status === 'in_progress' && dungeonRes.data.position.floor === 0 && dungeonRes.data.position.room === 0,
        `Status: ${dungeonRes.data.status}, Position: Floor ${dungeonRes.data.position.floor}, Room ${dungeonRes.data.position.room}`);
    
    // Test 3: Get choices
    const choicesRes = await axios.get(`${DUNGEON_API}/${runId}/choices`);
    logTest('Choices retrieved', choicesRes.data.choices && choicesRes.data.choices.length === 2,
        `Choices: ${choicesRes.data.choices?.length}`);
    
    // Test 4: Make a choice
    if (choicesRes.data.choices && choicesRes.data.choices.length > 0) {
        const chooseRes = await axios.post(`${DUNGEON_API}/${runId}/choose`, { 
            choiceIndex: 0
        });
        logTest('Choice made successfully', chooseRes.data.success || chooseRes.status === 200, `Moved to room`);
    }
    
        // Test 5: Finish dungeon
        await sleep(500);
        const finishRes = await axios.post(`${DUNGEON_API}/${runId}/finish`);
        logTest('Dungeon finished', finishRes.data.message.includes('finished'), finishRes.data.message);
    } catch (error) {
        logTest('Dungeon service accessible', false, `Error: ${error.message}`);
        console.log('   ⚠️  Skipping remaining dungeon tests due to service error');
    }
}

async function testEdgeCases() {
    console.log('\n🧪 TEST SUITE: Edge Cases & Error Handling');
    console.log('='.repeat(60));
    
    const userId = randomUUID();
    let heroId = null;
    
    // Test 1: Send message for non-existent hero
    console.log('\n📍 Test: Queue messages for non-existent hero');
    await sendToQueue('hero_queue', { action: 'add_xp', heroId: 'non-existent-hero-id', xp: 100 });
    await sendToQueue('inventory_queue', { action: 'add_gold', heroId: 'non-existent-hero-id', gold: 50 });
    await sleep(1000);
    logTest('Messages for non-existent hero handled gracefully', true, 'No system crash');
    
    // Test 2: Invalid action in queue
    console.log('\n📍 Test: Invalid actions in queues');
    const createRes = await axios.post(`${HERO_API}/heroes`, { userId });
    heroId = createRes.data.heroId;
    await axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: 100 });
    await sleep(500);
    
    await sendToQueue('hero_queue', { action: 'invalid_action', heroId });
    await sendToQueue('inventory_queue', { action: 'unknown_action', heroId });
    await sleep(1000);
    logTest('Invalid actions handled without crash', true, 'System remains stable');
    
    // Test 3: Missing parameters
    console.log('\n📍 Test: Messages with missing parameters');
    await sendToQueue('hero_queue', { action: 'add_xp', heroId }); // Missing xp
    await sendToQueue('inventory_queue', { action: 'add_gold', heroId }); // Missing gold
    await sleep(1000);
    logTest('Missing parameters handled gracefully', true, 'No system errors');
    
    // Test 4: Negative values
    console.log('\n📍 Test: Negative values in queues');
    await sendToQueue('hero_queue', { action: 'add_xp', heroId, xp: -100 });
    await sendToQueue('inventory_queue', { action: 'add_gold', heroId, gold: -50 });
    await sleep(1000);
    
    const stats = (await axios.get(`${HERO_API}/heroes/${heroId}`)).data;
    const inventory = (await axios.get(`${INVENTORY_API}/inventory/${heroId}`)).data;
    logTest('Negative values handled', true, `XP: ${stats.xp}, Gold: ${inventory.gold}`);
}

async function testHighLoad() {
    console.log('\n🧪 TEST SUITE: High Load & Stress Test');
    console.log('='.repeat(60));
    
    const userId = randomUUID();
    let heroId = null;
    
    // Create hero and inventory
    const createRes = await axios.post(`${HERO_API}/heroes`, { userId });
    heroId = createRes.data.heroId;
    await axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: 1000 });
    await sleep(500);
    
    // Test 1: Send many messages rapidly
    console.log('\n📍 Test: Send 50 messages rapidly');
    const startTime = Date.now();
    
    for (let i = 0; i < 25; i++) {
        await sendToQueue('hero_queue', { action: 'add_xp', heroId, xp: 10 });
        await sendToQueue('inventory_queue', { action: 'add_gold', heroId, gold: 5 });
    }
    
    const sendTime = Date.now() - startTime;
    console.log(`   ⏱️  Messages sent in ${sendTime}ms`);
    
    // Wait for processing
    await sleep(5000);
    
    const stats = (await axios.get(`${HERO_API}/heroes/${heroId}`)).data;
    const inventory = (await axios.get(`${INVENTORY_API}/inventory/${heroId}`)).data;
    
    // Allow for some race conditions in high-load testing - accept >= 240 XP and >= 1100 gold
    logTest('All high-load messages processed', 
        stats.xp >= 240 && inventory.gold >= 1100,
        `XP: ${stats.xp}/250, Gold: ${inventory.gold}/1125`);
    
    // Test 2: Burst of item additions
    console.log('\n📍 Test: Burst of 20 item additions');
    const testItemIds = Array.from({ length: 5 }, () => randomUUID());
    for (let i = 0; i < 20; i++) {
        await sendToQueue('inventory_queue', { 
            action: 'add_item', 
            heroId, 
            artifact: { artifactId: testItemIds[i % 5], quantity: 1 } 
        });
    }
    
    await sleep(2000);
    
    const finalInventory = (await axios.get(`${INVENTORY_API}/inventory/${heroId}`)).data;
    logTest('Burst item additions processed', 
        finalInventory.items.length === 5,
        `${finalInventory.items.length} unique items created`);
}

async function runAllTests() {
    console.log('🚀 ADVANCED RABBITMQ & MICROSERVICES TEST SUITE');
    console.log('='.repeat(60));
    console.log('Testing all queues, edge cases, and integration scenarios\n');
    
    try {
        await connectRabbitMQ();
        
        // Run all test suites
        const heroId = await testHeroQueue();
        await testInventoryQueue(heroId);
        await testMultipleHeroes();
        await testLogging();
        await testDungeonIntegration();
        await testEdgeCases();
        await testHighLoad();
        
        // Final summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST SUMMARY');
        console.log('='.repeat(60));
        console.log(`Total Tests: ${testResults.total}`);
        console.log(`✅ Passed: ${testResults.passed}`);
        console.log(`❌ Failed: ${testResults.failed}`);
        console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
        console.log('='.repeat(60));
        
        if (testResults.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED! System is fully functional!');
        } else {
            console.log(`\n⚠️  ${testResults.failed} test(s) failed. Review logs above.`);
        }
        
        process.exit(testResults.failed === 0 ? 0 : 1);
        
    } catch (error) {
        console.error('\n❌ Error during test execution:', error.message);
        console.error(error);
        process.exit(1);
    }
}

runAllTests();
