const axios = require('axios');
const { Client } = require('pg');

// Direct service URLs (bypass gateway auth)
const USER_SERVICE = 'http://localhost:3001';
const HERO_SERVICE = 'http://localhost:3003';

const DB_CONFIG = {
    host: 'localhost',
    port: 5432,
    user: 'admin',
    password: 'toto123',
    database: 'erjulrian_db'
};

let testsPassed = 0;
let testsFailed = 0;

// Utility functions
async function test(name, fn) {
    try {
        await fn();
        console.log(`✅ ${name}`);
        testsPassed++;
    } catch (error) {
        console.error(`❌ ${name}`);
        console.error(`   Error: ${error.message}`);
        testsFailed++;
    }
}

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

async function queryDB(query, params = []) {
    const client = new Client(DB_CONFIG);
    try {
        await client.connect();
        const result = await client.query(query, params);
        return result.rows;
    } finally {
        await client.end();
    }
}

// ============================================
// TESTS
// ============================================

async function runTests() {
    console.log('🧪 Testing user_id vs hero_id separation\n');
    
    let userId, hero1Id, hero2Id, hero3Id;

    // Test 1: Create user
    await test('Create a user', async () => {
        const response = await axios.post(`${USER_SERVICE}/user`, {
            name: `test_user_${Date.now()}`,
            isAdmin: false
        });
        
        userId = response.data.id;
        assert(userId, 'userId should be returned');
        console.log(`   User created: ${userId}`);
    });

    // Test 2: Create first hero
    await test('Create first hero for user', async () => {
        const response = await axios.post(`${HERO_SERVICE}/api/heroes`, {
            userId: userId
        });
        
        hero1Id = response.data.heroId;
        assert(hero1Id, 'heroId should be returned');
        assert(hero1Id !== userId, 'hero1Id should be different from userId');
        console.log(`   Hero1 created: ${hero1Id}`);
        console.log(`   User ID: ${userId}`);
    });

    // Test 3: Create second hero
    await test('Create second hero for same user', async () => {
        const response = await axios.post(`${HERO_SERVICE}/api/heroes`, {
            userId: userId
        });
        
        hero2Id = response.data.heroId;
        assert(hero2Id, 'hero2Id should be returned');
        assert(hero2Id !== userId, 'hero2Id should be different from userId');
        assert(hero2Id !== hero1Id, 'hero2Id should be different from hero1Id');
        console.log(`   Hero2 created: ${hero2Id}`);
    });

    // Test 4: Create third hero
    await test('Create third hero for same user', async () => {
        const response = await axios.post(`${HERO_SERVICE}/api/heroes`, {
            userId: userId
        });
        
        hero3Id = response.data.heroId;
        assert(hero3Id, 'hero3Id should be returned');
        assert(hero3Id !== userId, 'hero3Id should be different from userId');
        assert(hero3Id !== hero1Id, 'hero3Id should be different from hero1Id');
        assert(hero3Id !== hero2Id, 'hero3Id should be different from hero2Id');
        console.log(`   Hero3 created: ${hero3Id}`);
    });

    // Test 5: Verify database - user_id stored correctly
    await test('Verify user_id is stored in HeroStats', async () => {
        const rows = await queryDB(
            'SELECT hero_id, user_id FROM hero_schema.HeroStats WHERE hero_id = $1',
            [hero1Id]
        );
        
        assert(rows.length === 1, 'Should find one hero');
        assert(rows[0].user_id === userId, `user_id in DB should match: ${rows[0].user_id} === ${userId}`);
        assert(rows[0].hero_id === hero1Id, `hero_id in DB should match: ${rows[0].hero_id} === ${hero1Id}`);
        console.log(`   DB verified: hero_id=${hero1Id}, user_id=${userId}`);
    });

    // Test 6: Get all heroes for user
    await test('Get all heroes for user', async () => {
        // Wait for inventory messages to be processed
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const response = await axios.get(`${HERO_SERVICE}/api/users/${userId}/heroes`);
        
        const heroes = response.data;
        assert(Array.isArray(heroes), 'Response should be array');
        assert(heroes.length === 3, `Should have 3 heroes, got ${heroes.length}`);
        
        const heroIds = heroes.map(h => h.hero_id);
        assert(heroIds.includes(hero1Id), 'Should include hero1');
        assert(heroIds.includes(hero2Id), 'Should include hero2');
        assert(heroIds.includes(hero3Id), 'Should include hero3');
        
        console.log(`   Found ${heroes.length} heroes for user`);
    });

    // Test 7: Verify inventories created for each hero
    await test('Verify inventories exist for all heroes', async () => {
        const rows = await queryDB(
            `SELECT hero_id FROM inventory_schema.Inventories 
             WHERE hero_id IN ($1, $2, $3) ORDER BY hero_id`,
            [hero1Id, hero2Id, hero3Id]
        );
        
        assert(rows.length === 3, `Should have 3 inventories, got ${rows.length}`);
        assert(rows[0].hero_id === hero1Id, 'Inventory for hero1 should exist');
        assert(rows[1].hero_id === hero2Id, 'Inventory for hero2 should exist');
        assert(rows[2].hero_id === hero3Id, 'Inventory for hero3 should exist');
        console.log(`   All 3 inventories verified`);
    });

    // Test 8: Verify foreign key constraint
    await test('Verify hero_id in Inventories references HeroStats', async () => {
        const rows = await queryDB(
            `SELECT i.hero_id, h.hero_id as hero_stat_id, h.user_id
             FROM inventory_schema.Inventories i
             JOIN hero_schema.HeroStats h ON i.hero_id = h.hero_id
             WHERE i.hero_id = $1`,
            [hero1Id]
        );
        
        assert(rows.length === 1, 'Should find joined record');
        assert(rows[0].hero_id === rows[0].hero_stat_id, 'hero_id should match');
        assert(rows[0].user_id === userId, 'user_id should match');
        console.log(`   Foreign key constraint verified`);
    });

    // Test 9: Get individual hero and verify user_id
    await test('Get hero details and verify user_id', async () => {
        const response = await axios.get(`${HERO_SERVICE}/api/heroes/${hero1Id}`);
        
        const hero = response.data;
        assert(hero.hero_id === hero1Id, 'hero_id should match');
        assert(hero.user_id === userId, 'user_id should match');
        assert(hero.level === 1, 'initial level should be 1');
        assert(hero.xp === 0, 'initial xp should be 0');
        console.log(`   Hero details verified: level=${hero.level}, xp=${hero.xp}`);
    });

    // Test 10: Verify all heroes belong to the same user
    await test('Verify all heroes belong to same user', async () => {
        const rows = await queryDB(
            `SELECT DISTINCT user_id FROM hero_schema.HeroStats 
             WHERE hero_id IN ($1, $2, $3)`,
            [hero1Id, hero2Id, hero3Id]
        );
        
        assert(rows.length === 1, 'All heroes should have same user_id');
        assert(rows[0].user_id === userId, 'user_id should match');
        console.log(`   All 3 heroes belong to user ${userId}`);
    });

    // Print summary
    console.log(`\n${'='.repeat(50)}`);
    console.log(`Tests passed: ${testsPassed}`);
    console.log(`Tests failed: ${testsFailed}`);
    console.log(`${'='.repeat(50)}`);
    
    process.exit(testsFailed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
