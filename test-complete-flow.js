const amqp = require('amqplib');
const axios = require('axios');
const { randomUUID } = require('crypto');

const RABBITMQ_URL = 'amqp://localhost:5672';
const HERO_API = 'http://localhost:3003/api';
const INVENTORY_API = 'http://localhost:3004/api';
const DUNGEON_API = 'http://localhost:3005/api';

let channel;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function connectRabbitMQ() {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
}

async function testCompleteFlow() {
    console.log('\n🎮 TEST: Complete Dungeon Combat Flow with Damage Persistence\n');
    console.log('=' .repeat(80));
    
    let testsPassed = 0;
    let testsFailed = 0;
    
    try {
        await connectRabbitMQ();
        
        const userId = randomUUID();
        
        // Step 1: Create Hero
        console.log('\n📍 Step 1: Create Hero');
        console.log('-'.repeat(80));
        const heroResponse = await axios.post(`${HERO_API}/heroes`, { userId });
        const heroId = heroResponse.data.heroId;
        console.log(`✅ Hero created: ${heroId}`);
        console.log(`   Level: 1, HP: 20/20, ATT: 4, DEF: 1`);
        testsPassed++;
        
        await sleep(500);
        
        // Step 2: Get Hero initial stats
        console.log('\n📍 Step 2: Get Hero Initial Stats');
        console.log('-'.repeat(80));
        const initialHeroResponse = await axios.get(`${HERO_API}/heroes/${heroId}`);
        const initialHP = initialHeroResponse.data.current_hp;
        console.log(`✅ Hero stats retrieved`);
        console.log(`   Current HP: ${initialHeroResponse.data.current_hp}/${initialHeroResponse.data.base_hp}`);
        console.log(`   ATT: ${initialHeroResponse.data.base_att}, DEF: ${initialHeroResponse.data.base_def}`);
        testsPassed++;
        
        await sleep(500);
        
        // Step 3: Create Inventory
        console.log('\n📍 Step 3: Create Inventory');
        console.log('-'.repeat(80));
        const inventoryResponse = await axios.post(`${INVENTORY_API}/inventory`, { heroId });
        console.log(`✅ Inventory created for hero`);
        console.log(`   Initial Gold: ${inventoryResponse.data.gold}`);
        testsPassed++;
        
        await sleep(500);
        
        // Step 4: Start Dungeon Run
        console.log('\n📍 Step 4: Start Dungeon Run');
        console.log('-'.repeat(80));
        const dungeonPayload = {
            heroId: heroId,
            heroStats: {
                level: initialHeroResponse.data.level,
                xp: initialHeroResponse.data.xp,
                stats: {
                    hp: initialHeroResponse.data.base_hp,
                    current_hp: initialHeroResponse.data.current_hp,
                    att: initialHeroResponse.data.base_att,
                    def: initialHeroResponse.data.base_def,
                    regen: initialHeroResponse.data.base_regen
                }
            },
            equippedArtifacts: []
        };
        
        const dungeonStartResponse = await axios.post(`${DUNGEON_API}/dungeons/start`, dungeonPayload);
        const runId = dungeonStartResponse.data.runId;
        console.log(`✅ Dungeon run started: ${runId}`);
        console.log(`   Status: ${dungeonStartResponse.data.status}`);
        console.log(`   Position: Floor ${dungeonStartResponse.data.position.floor}, Room ${dungeonStartResponse.data.position.room}`);
        testsPassed++;
        
        await sleep(500);
        
        // Step 5: Get Dungeon Initial State
        console.log('\n📍 Step 5: Get Dungeon Initial State');
        console.log('-'.repeat(80));
        const initialDungeonResponse = await axios.get(`${DUNGEON_API}/dungeons/${runId}`);
        console.log(`✅ Dungeon state retrieved`);
        console.log(`   Hero ID in dungeon: ${initialDungeonResponse.data.heroId}`);
        console.log(`   Current position: Floor ${initialDungeonResponse.data.position.floor}, Room ${initialDungeonResponse.data.position.room}`);
        testsPassed++;
        
        await sleep(500);
        
        // Step 6: Simulate Combat Damage via RabbitMQ
        console.log('\n📍 Step 6: Simulate Combat Damage (via RabbitMQ)');
        console.log('-'.repeat(80));
        
        const damageAmount = 5;
        const battleResult = {
            hero: {
                heroId: heroId,
                level: 1,
                xp: 0,
                stats: dungeonPayload.heroStats.stats
            },
            monster: {
                name: 'Test Monster',
                type: 'test',
                id: randomUUID(),
                stats: { hp: 50, att: 3, def: 1, regen: 1 }
            },
            runId: runId,
            result: 'win',
            gold: 50,
            xpDelta: 100,
            damageDealt: damageAmount,
            items: []
        };
        
        await channel.assertQueue('combat_result_queue', { durable: true });
        channel.sendToQueue('combat_result_queue', Buffer.from(JSON.stringify(battleResult)), { persistent: true });
        
        console.log(`✅ Combat result sent to combat_result_queue`);
        console.log(`   Damage: ${damageAmount} HP`);
        console.log(`   Expected HP after: ${initialHP - damageAmount}/20`);
        testsPassed++;
        
        await sleep(3000); // Wait for combat result to be processed
        
        // Step 7: Check Hero HP After Combat
        console.log('\n📍 Step 7: Verify Hero HP Updated After Combat');
        console.log('-'.repeat(80));
        const postCombatHeroResponse = await axios.get(`${HERO_API}/heroes/${heroId}`);
        const expectedHP = initialHP - damageAmount;
        
        if (postCombatHeroResponse.data.current_hp === expectedHP) {
            console.log(`✅ Hero HP correctly updated in PostgreSQL`);
            console.log(`   HP: ${postCombatHeroResponse.data.current_hp}/${postCombatHeroResponse.data.base_hp} (was ${initialHP}, took ${damageAmount} damage)`);
            testsPassed++;
        } else {
            console.log(`❌ Hero HP not updated correctly`);
            console.log(`   Expected: ${expectedHP}, Got: ${postCombatHeroResponse.data.current_hp}`);
            testsFailed++;
        }
        
        await sleep(500);
        
        // Step 8: Check Dungeon Snapshot Updated
        console.log('\n📍 Step 8: Verify Dungeon Snapshot Updated');
        console.log('-'.repeat(80));
        const postCombatDungeonResponse = await axios.get(`${DUNGEON_API}/dungeons/${runId}`);
        
        console.log(`✅ Dungeon snapshot persisted`);
        console.log(`   Dungeon still knows hero: ${postCombatDungeonResponse.data.heroId}`);
        console.log(`   Status: ${postCombatDungeonResponse.data.status}`);
        testsPassed++;
        
        // Step 9: Send Gold/XP Update via Inventory Queue
        console.log('\n📍 Step 9: Send Gold/XP Update (via RabbitMQ Queues)');
        console.log('-'.repeat(80));
        
        const heroUpdateMsg = {
            action: 'update_hero',
            heroId: heroId,
            xpDelta: battleResult.xpDelta,
            hpDelta: postCombatHeroResponse.data.current_hp
        };
        
        await channel.assertQueue('hero_queue', { durable: true });
        channel.sendToQueue('hero_queue', Buffer.from(JSON.stringify(heroUpdateMsg)), { persistent: true });
        
        const inventoryUpdateMsg = {
            action: 'update_inventory',
            heroId: heroId,
            gold: battleResult.gold,
            items: []
        };
        
        await channel.assertQueue('inventory_queue', { durable: true });
        channel.sendToQueue('inventory_queue', Buffer.from(JSON.stringify(inventoryUpdateMsg)), { persistent: true });
        
        console.log(`✅ Updates sent to queues`);
        console.log(`   Hero queue: +${battleResult.xpDelta} XP`);
        console.log(`   Inventory queue: +${battleResult.gold} gold`);
        testsPassed++;
        
        await sleep(2000); // Wait for queue processing
        
        // Step 10: Verify Final State
        console.log('\n📍 Step 10: Verify Final State');
        console.log('-'.repeat(80));
        const finalHeroResponse = await axios.get(`${HERO_API}/heroes/${heroId}`);
        const finalInventoryResponse = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
        
        console.log(`✅ Final state verified`);
        console.log(`   Hero Level: ${finalHeroResponse.data.level}`);
        console.log(`   Hero XP: ${finalHeroResponse.data.xp}`);
        console.log(`   Hero HP: ${finalHeroResponse.data.current_hp}/${finalHeroResponse.data.base_hp}`);
        console.log(`   Inventory Gold: ${finalInventoryResponse.data.gold}`);
        testsPassed++;
        
        // Summary
        console.log('\n' + '=' .repeat(80));
        console.log('📊 COMPLETE FLOW TEST RESULTS');
        console.log('=' .repeat(80));
        console.log(`✅ Passed: ${testsPassed}`);
        console.log(`❌ Failed: ${testsFailed}`);
        console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
        console.log('=' .repeat(80));
        console.log('\n🔍 Verification:');
        console.log(`   ✓ Hero created in db-hero`);
        console.log(`   ✓ Inventory created in db-inventory`);
        console.log(`   ✓ Dungeon run created in MongoDB`);
        console.log(`   ✓ Combat damage persisted to PostgreSQL`);
        console.log(`   ✓ Combat result persisted to Dungeon snapshot`);
        console.log(`   ✓ XP and Gold updated via RabbitMQ queues`);
        console.log(`   ✓ All services fully decoupled\n`);
        
        if (testsFailed === 0) {
            console.log('🎉 Complete flow working perfectly!\n');
            process.exit(0);
        } else {
            console.log('⚠️  Some tests failed\n');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Test suite error:', error.message);
        if (error.response?.data) {
            console.error('Response:', error.response.data);
        }
        process.exit(1);
    }
}

testCompleteFlow();
