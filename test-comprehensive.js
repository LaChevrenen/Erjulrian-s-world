const amqp = require('amqplib');
const axios = require('axios');
const { randomUUID } = require('crypto');
const artifacts = require('./data/artifacts.json');

const [
    ARTIFACT_A,
    ARTIFACT_B,
    ARTIFACT_C,
    ARTIFACT_D,
    ARTIFACT_E,
    ARTIFACT_F
] = artifacts.map(a => a.id);

const RABBITMQ_URL = 'amqp://localhost:5672';
const HERO_API = 'http://localhost:3003/api';
const INVENTORY_API = 'http://localhost:3004/api';
const LOG_API = 'http://localhost:3009/api';
const DUNGEON_API = 'http://localhost:3005/api/dungeons';

let channel;
let testResults = {
    passed: 0,
    failed: 0,
    total: 0,
    skipped: 0
};

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        channel = await connection.createChannel();
        console.log('✓ Connected to RabbitMQ\n');
        return true;
    } catch (e) {
        console.error('Failed to connect to RabbitMQ:', e.message);
        return false;
    }
}

async function sendToQueue(queue, message) {
    try {
        await channel.assertQueue(queue, { durable: true });
        channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), { persistent: true });
        return true;
    } catch (e) {
        console.error(`Failed to send to queue ${queue}:`, e.message);
        return false;
    }
}

function logTest(name, passed, details = '', error = '') {
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
    if (error) {
        console.log(`   Error: ${error}`);
    }
}

function skipTest(name, reason) {
    testResults.total++;
    testResults.skipped++;
    console.log(`⏭️  ${name} (${reason})`);
}

// ============================================
// HERO SERVICE TESTS
// ============================================
async function testHeroServiceREST() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Hero Service - REST API');
    console.log('='.repeat(70));
    
    try {
        // Test 1: Create hero
        const userId = randomUUID();
        const createRes = await axios.post(`${HERO_API}/heroes`, { userId });
        logTest('Create hero via REST', createRes.status === 201 && createRes.data.heroId);
        
        if (!createRes.data.heroId) {
            return null;
        }
        
        const heroId = createRes.data.heroId;
        
        // Test 2: Get created hero
        const getRes = await axios.get(`${HERO_API}/heroes/${heroId}`);
        logTest('Get created hero returns 200', getRes.status === 200);
        
        // Test 3: Get hero stats
        const heroStats = getRes.data;
        logTest('Hero has initial stats', 
            heroStats.xp === 0 && heroStats.level === 1 && heroStats.base_hp > 0,
            `XP: ${heroStats.xp}, Level: ${heroStats.level}, HP: ${heroStats.base_hp}`);
        
        // Test 4: List heroes (optional)
        try {
            const listRes = await axios.get(`${HERO_API}/heroes`);
            logTest('List heroes works', Array.isArray(listRes.data), `Count: ${listRes.data.length}`);
        } catch (e) {
            logTest('List heroes works', [404, 501].includes(e.response?.status));
        }
        
        // Test 5: Get invalid hero should 404
        try {
            await axios.get(`${HERO_API}/heroes/invalid-uuid`);
            logTest('Invalid hero returns 404', false);
        } catch (e) {
            logTest('Invalid hero returns 404', [400, 404].includes(e.response?.status));
        }
        
        return { heroId, userId };
    } catch (error) {
        console.error('Hero REST API test failed:', error.message);
        return null;
    }
}

async function testHeroQueueUpdate() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Hero Service - Queue Updates');
    console.log('='.repeat(70));
    
    try {
        const userId = randomUUID();
        
        // Create hero
        const createRes = await axios.post(`${HERO_API}/heroes`, { userId });
        logTest('Setup: Create hero', createRes.status === 201);
        
        const heroId = createRes.data.heroId;
        if (!heroId) {
            console.log('   Cannot proceed - no heroId returned');
            return;
        }
        await sleep(500);
        
        // Test 1: Update hero with positive XP
        await sendToQueue('hero_queue', { action: 'update_hero', heroId, xpDelta: 100, hpDelta: 0 });
        await sleep(1000);
        
        let hero = await axios.get(`${HERO_API}/heroes/${heroId}`);
        logTest('Update hero: Add XP', hero.data.xp === 100, `XP: ${hero.data.xp}`);
        
        // Test 2: Update hero with negative XP (should not go below 0)
        await sendToQueue('hero_queue', { action: 'update_hero', heroId, xpDelta: -50, hpDelta: 0 });
        await sleep(1000);
        
        hero = await axios.get(`${HERO_API}/heroes/${heroId}`);
        logTest('Update hero: Subtract XP', hero.data.xp === 50, `XP: ${hero.data.xp}`);
        
        // Test 3: Add HP
        const initialHp = hero.data.base_hp;
        await sendToQueue('hero_queue', { action: 'update_hero', heroId, xpDelta: 0, hpDelta: 50 });
        await sleep(1000);
        
        hero = await axios.get(`${HERO_API}/heroes/${heroId}`);
        logTest('Update hero: Add HP', hero.data.base_hp === initialHp + 50, `HP: ${hero.data.base_hp}`);
        
        // Test 4: Subtract HP
        await sendToQueue('hero_queue', { action: 'update_hero', heroId, xpDelta: 0, hpDelta: -30 });
        await sleep(1000);
        
        hero = await axios.get(`${HERO_API}/heroes/${heroId}`);
        logTest('Update hero: Subtract HP', hero.data.base_hp === initialHp + 20, `HP: ${hero.data.base_hp}`);
        
        // Test 5: HP should not go below 0
        const currentHp = hero.data.base_hp;
        await sendToQueue('hero_queue', { action: 'update_hero', heroId, xpDelta: 0, hpDelta: -currentHp - 100 });
        await sleep(1000);
        
        hero = await axios.get(`${HERO_API}/heroes/${heroId}`);
        logTest('Update hero: HP floor at 0', hero.data.base_hp === 0, `HP: ${hero.data.base_hp}`);
        
        // Test 6: Both XP and HP in one message
        const createRes2 = await axios.post(`${HERO_API}/heroes`, { userId: randomUUID() });
        const heroId2 = createRes2.data.heroId;
        await sleep(500);
        
        await sendToQueue('hero_queue', { action: 'update_hero', heroId: heroId2, xpDelta: 200, hpDelta: 100 });
        await sleep(1000);
        
        hero = await axios.get(`${HERO_API}/heroes/${heroId2}`);
        logTest('Update hero: Atomic XP+HP', hero.data.xp === 200 && hero.data.base_hp >= 100, 
            `XP: ${hero.data.xp}, HP: ${hero.data.base_hp}`);
        
    } catch (error) {
        console.error('Hero queue test failed:', error.message);
    }
}

async function testHeroXPProgression() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Hero XP and Level Progression');
    console.log('='.repeat(70));
    
    try {
        // Level progression: level = floor(sqrt(xp/100)) + 1
        const testCases = [
            { xp: 0, expectedLevel: 1 },      // sqrt(0) + 1 = 1
            { xp: 100, expectedLevel: 2 },    // sqrt(1) + 1 = 2
            { xp: 400, expectedLevel: 3 },    // sqrt(4) + 1 = 3
            { xp: 900, expectedLevel: 4 },    // sqrt(9) + 1 = 4
            { xp: 1600, expectedLevel: 5 },   // sqrt(16) + 1 = 5
        ];
        
        for (const tc of testCases) {
            const userId = randomUUID();
            const createRes = await axios.post(`${HERO_API}/heroes`, { userId });
            const testHeroId = createRes.data.heroId;
            if (!testHeroId) continue;
            
            await sleep(300);
            
            await sendToQueue('hero_queue', { action: 'update_hero', heroId: testHeroId, xpDelta: tc.xp, hpDelta: 0 });
            await sleep(1000);
            
            const hero = await axios.get(`${HERO_API}/heroes/${testHeroId}`);
            logTest(`Level progression: ${tc.xp} XP = Level ${tc.expectedLevel}`, 
                hero.data.level === tc.expectedLevel,
                `Got Level ${hero.data.level}, XP: ${hero.data.xp}`);
        }
        
    } catch (error) {
        console.error('XP progression test failed:', error.message);
    }
}

// ============================================
// INVENTORY SERVICE TESTS
// ============================================
async function testInventoryServiceREST() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Inventory Service - REST API');
    console.log('='.repeat(70));
    
    try {
        const heroId = randomUUID();
        
        // Test 1: Create inventory
        const createRes = await axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: 1000 });
        logTest('Create inventory', createRes.status === 201 && createRes.data.gold === 1000);
        
        // Test 2: Get inventory
        const getRes = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Get inventory', getRes.status === 200 && getRes.data.gold === 1000);
        
        // Test 3: Update inventory
        const updateRes = await axios.put(`${INVENTORY_API}/inventory/${heroId}`, { 
            gold: 500,
            items: [
                { artifactId: ARTIFACT_A, quantity: 1, equipped: true },
                { artifactId: ARTIFACT_B, quantity: 1, equipped: false }
            ]
        });
        logTest('Update inventory', updateRes.status === 200);
        
        // Test 4: Verify items were added
        const updatedInv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Items persist', updatedInv.data.items.length === 2);
        
        // Test 5: Delete inventory
        const deleteRes = await axios.delete(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Delete inventory', deleteRes.status === 204);
        
        // Test 6: Get deleted inventory should fail
        try {
            await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
            logTest('Deleted inventory returns 404', false);
        } catch (e) {
            logTest('Deleted inventory returns 404', e.response.status === 404);
        }
        
    } catch (error) {
        console.error('Inventory REST test failed:', error.message);
    }
}

async function testInventoryQueueUpdate() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Inventory Service - Queue Updates');
    console.log('='.repeat(70));
    
    try {
        const heroId = randomUUID();
        
        // Setup: Create inventory
        const createRes = await axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: 1000 });
        logTest('Setup: Create inventory', createRes.status === 201);
        await sleep(500);
        
        // Test 1: Add gold via queue
            await sendToQueue('inventory_queue', { 
                action: 'update_inventory', 
                heroId, 
                goldDelta: 500,
                itemsToAdd: [],
                itemsToRemove: []
            });
        await sleep(1000);
        
        let inv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Add gold via queue', inv.data.gold === 1500, `Gold: ${inv.data.gold}`);
        
        // Test 2: Remove gold via queue
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId, 
            goldDelta: -300,
            itemsToAdd: [],
            itemsToRemove: []
        });
        await sleep(1000);
        
        inv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Remove gold via queue', inv.data.gold === 1200, `Gold: ${inv.data.gold}`);
        
        // Test 3: Gold should not go below 0
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId, 
            goldDelta: -2000,
            itemsToAdd: [],
            itemsToRemove: []
        });
        await sleep(1000);
        
        inv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Gold floor at 0', inv.data.gold === 0, `Gold: ${inv.data.gold}`);
        
        // Test 4: Add artifacts
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId, 
            goldDelta: 100,
            itemsToAdd: [
                { artifactId: ARTIFACT_A, quantity: 1 },
                { artifactId: ARTIFACT_B, quantity: 2 }
            ],
            itemsToRemove: []
        });
        await sleep(1000);
        
        inv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Add artifacts via queue', inv.data.items.length === 2, `Items: ${inv.data.items.length}`);
        
        // Test 5: Increase artifact quantity
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId, 
            goldDelta: 0,
            itemsToAdd: [{ artifactId: ARTIFACT_A, quantity: 2 }],
            itemsToRemove: []
        });
        await sleep(1000);
        
        inv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        const sword = inv.data.items.find(i => i.artifactId === ARTIFACT_A);
        logTest('Increase artifact quantity', sword && sword.quantity === 3, `Sword qty: ${sword?.quantity}`);
        
        // Test 6: Remove artifacts
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId, 
            goldDelta: 0,
            itemsToAdd: [],
            itemsToRemove: [ARTIFACT_B]
        });
        await sleep(1000);
        
        inv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Remove artifacts via queue', inv.data.items.length === 1, `Items: ${inv.data.items.length}`);
        
        // Test 7: Atomic gold + artifacts
        const newHeroId = randomUUID();
        await axios.post(`${INVENTORY_API}/inventory`, { heroId: newHeroId, gold: 0 });
        await sleep(500);
        
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId: newHeroId, 
            goldDelta: 250,
            itemsToAdd: [
                { artifactId: ARTIFACT_C, quantity: 5 },
                { artifactId: ARTIFACT_D, quantity: 3 }
            ],
            itemsToRemove: []
        });
        await sleep(1000);
        
        inv = await axios.get(`${INVENTORY_API}/inventory/${newHeroId}`);
        logTest('Atomic gold + artifacts', inv.data.gold === 250 && inv.data.items.length === 2,
            `Gold: ${inv.data.gold}, Items: ${inv.data.items.length}`);
        
    } catch (error) {
        console.error('Inventory queue test failed:', error.message);
    }
}

// ============================================
// DUNGEON SERVICE TESTS
// ============================================
async function testDungeonServiceREST() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Dungeon Service - REST API');
    console.log('='.repeat(70));
    
    try {
        // Test 1: Start dungeon run
        const heroCreate = await axios.post(`${HERO_API}/heroes`, { userId: randomUUID() });
        const heroId = heroCreate.data.heroId;
        const startRes = await axios.post(`${DUNGEON_API}/start`, { heroId });
        logTest('Start dungeon run', startRes.status === 200 && startRes.data.runId);
        
        if (!startRes.data.runId) {
            console.log('   Skipping dungeon tests - no runId returned');
            return;
        }
        
        const runId = startRes.data.runId;
        
        // Test 2: Get run state
        const getRes = await axios.get(`${DUNGEON_API}/${runId}`);
        logTest('Get dungeon run state', getRes.status === 200 && getRes.data.currentFloor !== undefined);
        
        // Test 3: Get choices
        const choicesRes = await axios.get(`${DUNGEON_API}/${runId}/choices`);
        logTest('Get dungeon choices', choicesRes.status === 200 && Array.isArray(choicesRes.data));
        
        // Test 4: Make a choice
        if (choicesRes.data.length > 0) {
            const choiceRes = await axios.post(`${DUNGEON_API}/${runId}/choose`, { 
                choiceId: choicesRes.data[0].choiceId 
            });
            logTest('Make dungeon choice', choiceRes.status === 200);
        }
        
        // Test 5: Finish run
        const finishRes = await axios.post(`${DUNGEON_API}/${runId}/finish`, {});
        logTest('Finish dungeon run', finishRes.status === 200);
        
    } catch (error) {
        console.error('Dungeon REST test failed:', error.message);
    }
}

// ============================================
// CONCURRENCY TESTS
// ============================================
async function testConcurrentHeroUpdates() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Concurrent Hero Updates');
    console.log('='.repeat(70));
    
    try {
        const userId = randomUUID();
        
        // Setup
        const createRes = await axios.post(`${HERO_API}/heroes`, { userId });
        const heroId = createRes.data.heroId;
        if (!heroId) return;
        
        await sleep(500);
        
        // Send 10 concurrent XP updates
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(sendToQueue('hero_queue', { 
                action: 'update_hero', 
                heroId, 
                xpDelta: 50, 
                hpDelta: 0 
            }));
        }
        await Promise.all(promises);
        await sleep(2000);
        
        const hero = await axios.get(`${HERO_API}/heroes/${heroId}`);
        logTest('Concurrent XP updates sum correctly', hero.data.xp === 500, `XP: ${hero.data.xp}`);
        
    } catch (error) {
        console.error('Concurrent hero test failed:', error.message);
    }
}

async function testConcurrentInventoryUpdates() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Concurrent Inventory Updates');
    console.log('='.repeat(70));
    
    try {
        const heroId = randomUUID();
        
        // Setup
        await axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: 0 });
        await sleep(500);
        
        // Send 10 concurrent gold updates
        const promises = [];
        for (let i = 0; i < 10; i++) {
            promises.push(sendToQueue('inventory_queue', { 
                action: 'update_inventory', 
                heroId, 
                goldDelta: 100,
                itemsToAdd: [],
                itemsToRemove: []
            }));
        }
        await Promise.all(promises);
        await sleep(2000);
        
        const inv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        logTest('Concurrent gold updates sum correctly', inv.data.gold === 1000, `Gold: ${inv.data.gold}`);
        
    } catch (error) {
        console.error('Concurrent inventory test failed:', error.message);
    }
}

// ============================================
// ERROR HANDLING TESTS
// ============================================
async function testErrorHandling() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Error Handling');
    console.log('='.repeat(70));
    
    // Test 1: Invalid heroId should return 400/404
    try {
        await axios.get(`${HERO_API}/heroes/invalid-id`);
        logTest('Invalid hero 404', false);
    } catch (e) {
        logTest('Invalid hero 404', [400, 404].includes(e.response?.status));
    }
    
    // Test 2: Missing required field in create hero
    try {
        await axios.post(`${HERO_API}/heroes`, {});
        logTest('Missing userId returns error', false);
    } catch (e) {
        logTest('Missing userId returns error', e.response?.status >= 400);
    }
    
    // Test 3: Invalid inventory heroId
    try {
        await axios.get(`${INVENTORY_API}/inventory/invalid-id`);
        logTest('Invalid inventory 404', false);
    } catch (e) {
        logTest('Invalid inventory 404', e.response?.status === 404);
    }
}

// ============================================
// EDGE CASES TESTS
// ============================================
async function testEdgeCases() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Edge Cases');
    console.log('='.repeat(70));
    
    try {
        // Test 1: Zero XP gain
        const userId1 = randomUUID();
        const res1 = await axios.post(`${HERO_API}/heroes`, { userId: userId1 });
        const heroId1 = res1.data.heroId;
        await sleep(500);
        
        await sendToQueue('hero_queue', { action: 'update_hero', heroId: heroId1, xpDelta: 0, hpDelta: 0 });
        await sleep(1000);
        
        let hero = await axios.get(`${HERO_API}/heroes/${heroId1}`);
        logTest('Zero XP gain handled', hero.data.xp === 0, `XP: ${hero.data.xp}`);
        
        // Test 2: Very large XP values
        const userId2 = randomUUID();
        const res2 = await axios.post(`${HERO_API}/heroes`, { userId: userId2 });
        const heroId2 = res2.data.heroId;
        await sleep(500);
        
        await sendToQueue('hero_queue', { action: 'update_hero', heroId: heroId2, xpDelta: 999999, hpDelta: 0 });
        await sleep(1000);
        
        hero = await axios.get(`${HERO_API}/heroes/${heroId2}`);
        logTest('Very large XP values', hero.data.xp === 999999 && hero.data.level === 100, 
            `XP: ${hero.data.xp}, Level: ${hero.data.level}`);
        
        // Test 3: Negative quantities
        const heroId3 = randomUUID();
        await axios.post(`${INVENTORY_API}/inventory`, { heroId: heroId3, gold: 100 });
        await sleep(500);
        
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId: heroId3, 
            goldDelta: -200,
            itemsToAdd: [],
            itemsToRemove: []
        });
        await sleep(1000);
        
        let inv = await axios.get(`${INVENTORY_API}/inventory/${heroId3}`);
        logTest('Negative gold clamped to 0', inv.data.gold === 0, `Gold: ${inv.data.gold}`);
        
        // Test 4: Empty items arrays
        const heroId4 = randomUUID();
        await axios.post(`${INVENTORY_API}/inventory`, { heroId: heroId4, gold: 100 });
        await sleep(500);
        
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId: heroId4, 
            goldDelta: 0,
            itemsToAdd: [],
            itemsToRemove: []
        });
        await sleep(1000);
        
        inv = await axios.get(`${INVENTORY_API}/inventory/${heroId4}`);
        logTest('Empty items update handled', inv.data.items.length === 0);
        
    } catch (error) {
        console.error('Edge cases test failed:', error.message);
    }
}

// ============================================
// INTEGRATION TESTS
// ============================================
async function testIntegration() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Integration Tests');
    console.log('='.repeat(70));
    
    try {
        // Simulate a combat scenario
        const userId = randomUUID();
        
        // Create hero and inventory
        const heroRes = await axios.post(`${HERO_API}/heroes`, { userId });
        const heroId = heroRes.data.heroId;
        logTest('Create hero for integration test', heroRes.status === 201);
        
        const invRes = await axios.post(`${INVENTORY_API}/inventory`, { heroId, gold: 100 });
        logTest('Create inventory for integration test', invRes.status === 201);
        await sleep(1000);
        
        // Simulate combat result: gain XP + gold + loot
        await sendToQueue('hero_queue', { action: 'update_hero', heroId, xpDelta: 250, hpDelta: -15 });
        await sendToQueue('inventory_queue', { 
            action: 'update_inventory', 
            heroId, 
            goldDelta: 75,
            itemsToAdd: [
                { artifactId: ARTIFACT_E, quantity: 2 },
                { artifactId: ARTIFACT_F, quantity: 1 }
            ],
            itemsToRemove: []
        });
        await sleep(2000);
        
        // Verify both updates
        const hero = await axios.get(`${HERO_API}/heroes/${heroId}`);
        const inv = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        
        logTest('Integration: Hero stats updated', hero.data.xp === 250 && hero.data.base_hp < 100,
            `XP: ${hero.data.xp}, HP: ${hero.data.base_hp}`);
        logTest('Integration: Inventory updated', inv.data.gold === 175 && inv.data.items.length === 2,
            `Gold: ${inv.data.gold}, Items: ${inv.data.items.length}`);
        
    } catch (error) {
        console.error('Integration test failed:', error.message);
    }
}

// ============================================
// LOG SERVICE TESTS
// ============================================
async function testLogService() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Log Service');
    console.log('='.repeat(70));
    
    try {
        // Test 1: Get logs (should return array)
        const logsRes = await axios.get(`${LOG_API}/logs`);
        logTest('Get logs endpoint works', Array.isArray(logsRes.data), `Log count: ${logsRes.data.length}`);
        
        // Test 2: Logs should have required fields
        if (logsRes.data.length > 0) {
            const log = logsRes.data[0];
            const hasRequired = log.user_id && log.timestamp && log.service && (log.eventType || log.event_type);
            logTest('Log entries have required fields', !!hasRequired);
        }
        
    } catch (error) {
        console.error('Log service test failed:', error.message);
    }
}

// ============================================
// STRESS TESTS
// ============================================
async function testStress() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 TEST SUITE: Stress Tests');
    console.log('='.repeat(70));
    
    try {
        // Stress test 1: Create multiple heroes rapidly
        console.log('\n📍 Creating 20 heroes rapidly...');
        const heroIds = [];
        for (let i = 0; i < 20; i++) {
            const res = await axios.post(`${HERO_API}/heroes`, { userId: randomUUID() });
            if (res.data.heroId) heroIds.push(res.data.heroId);
            if (i % 5 === 0) process.stdout.write('.');
        }
        console.log(' Done!');
        logTest('Create 20 heroes rapidly', heroIds.length >= 15, `Created: ${heroIds.length}`);
        
        // Stress test 2: Send many queue messages
        console.log('\n📍 Sending 50 queue messages...');
        const queuePromises = [];
        for (let i = 0; i < 50; i++) {
            if (heroIds.length > 0) {
                queuePromises.push(sendToQueue('hero_queue', {
                    action: 'update_hero',
                    heroId: heroIds[i % heroIds.length],
                    xpDelta: 10,
                    hpDelta: 5
                }));
            }
            if (i % 10 === 0) process.stdout.write('.');
        }
        await Promise.all(queuePromises);
        console.log(' Done!');
        logTest('Send 50 queue messages', queuePromises.length === 50);
        
        await sleep(2000);
        
        // Stress test 3: Retrieve all created heroes
        console.log('\n📍 Retrieving all heroes...');
        let retrieveCount = 0;
        for (const id of heroIds) {
            try {
                await axios.get(`${HERO_API}/heroes/${id}`);
                retrieveCount++;
            } catch (e) {
                // Ignore
            }
        }
        logTest('Retrieve all created heroes', retrieveCount >= heroIds.length * 0.8,
            `Retrieved: ${retrieveCount}/${heroIds.length}`);
        
    } catch (error) {
        console.error('Stress test failed:', error.message);
    }
}

// ============================================
// MAIN TEST RUNNER
// ============================================
async function runAllTests() {
    console.log('\n');
    console.log('╔' + '═'.repeat(68) + '╗');
    console.log('║' + ' '.repeat(15) + '🚀 COMPREHENSIVE TEST SUITE 🚀' + ' '.repeat(22) + '║');
    console.log('╚' + '═'.repeat(68) + '╝\n');
    
    const connected = await connectRabbitMQ();
    if (!connected) {
        console.error('Cannot proceed without RabbitMQ connection');
        process.exit(1);
    }
    
    // Run all test suites
    await testHeroServiceREST();
    await sleep(1000);
    
    await testHeroQueueUpdate();
    await sleep(1000);
    
    await testHeroXPProgression();
    await sleep(1000);
    
    await testInventoryServiceREST();
    await sleep(1000);
    
    await testInventoryQueueUpdate();
    await sleep(1000);
    
    await testDungeonServiceREST();
    await sleep(1000);
    
    await testConcurrentHeroUpdates();
    await sleep(1000);
    
    await testConcurrentInventoryUpdates();
    await sleep(1000);
    
    await testErrorHandling();
    await sleep(1000);
    
    await testEdgeCases();
    await sleep(1000);
    
    await testIntegration();
    await sleep(1000);
    
    await testLogService();
    await sleep(1000);
    
    await testStress();
    
    // Print results
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST RESULTS SUMMARY');
    console.log('='.repeat(70));
    console.log(`✅ Passed:  ${testResults.passed}`);
    console.log(`❌ Failed:  ${testResults.failed}`);
    console.log(`⏭️  Skipped: ${testResults.skipped}`);
    console.log(`📈 Total:   ${testResults.total}`);
    const passRate = ((testResults.passed / (testResults.total - testResults.skipped)) * 100).toFixed(1);
    console.log(`🎯 Pass Rate: ${passRate}%`);
    console.log('='.repeat(70) + '\n');
    
    process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
    console.error('Test runner error:', error);
    process.exit(1);
});
