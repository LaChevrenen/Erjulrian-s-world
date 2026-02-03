const axios = require('axios');
const { Pool } = require('pg');
const crypto = require('crypto');

const USER_API_BASE = 'http://localhost:3001';
const HERO_API_BASE = 'http://localhost:3003';
const INVENTORY_API_BASE = 'http://localhost:3004';
const DB_CONFIG = {
  user: 'inventory_user',
  password: 'inventory_secure_password',
  host: 'localhost',
  port: 5433,
  database: 'erjulrian_inventory'
};

let db;
let userId;
let heroId;
const ARTIFACT_A = 'a1111111-1111-1111-1111-111111111111';
const ARTIFACT_B = 'b2222222-2222-2222-2222-222222222222';

async function dbQuery(sql, params = []) {
  try {
    const result = await db.query(sql, params);
    return result;
  } catch (err) {
    console.error('DB Query Error:', err.message);
    throw err;
  }
}

async function logTest(name, passed, details = '') {
  const status = passed ? '✓' : '✗';
  console.log(`${status} ${name}${details ? ` - ${details}` : ''}`);
}

async function createUser() {
  try {
    userId = crypto.randomUUID();
    const response = await axios.post(`${USER_API_BASE}/api/users`, {
      id: userId,
      username: 'testuser_' + Date.now()
    });
    console.log(`Created user: ${userId}`);
  } catch (error) {
    console.error('Failed to create user:', error.response?.data || error.message);
    throw error;
  }
}

async function createHero() {
  try {
    const response = await axios.post(`${HERO_API_BASE}/api/heroes`, {
      userId: userId
    });
    heroId = response.data.heroId;
    console.log(`Created hero: ${heroId}`);
  } catch (error) {
    console.error('Failed to create hero:', error.response?.data || error.message);
    throw error;
  }
}

async function getInventoryItems() {
  try {
    const response = await axios.get(`${INVENTORY_API_BASE}/api/inventory/${heroId}`);
    return response.data.items || [];
  } catch (error) {
    console.error('Failed to get inventory:', error.response?.data || error.message);
    return [];
  }
}

async function updateInventory(items) {
  try {
    const response = await axios.put(`${INVENTORY_API_BASE}/api/inventory/${heroId}`, {
      gold: 100,
      items
    });
    return response.data;
  } catch (error) {
    console.error('Failed to update inventory:', error.response?.data || error.message);
    throw error;
  }
}

async function test() {
  try {
    // Connect to database
    db = new Pool(DB_CONFIG);
    console.log('Connected to database');

    // Create user and hero
    await createUser();
    await createHero();

    // Test 1: Add artifact with upgrade level 0
    console.log('\n--- Test 1: Add artifact with upgrade level 0 ---');
    await updateInventory([
      { artifactId: ARTIFACT_A, equipped: false, upgradeLevel: 0 }
    ]);
    let items = await getInventoryItems();
    console.log('Items:', JSON.stringify(items, null, 2));
    await logTest('Single artifact added', items.length === 1, `Items count: ${items.length}`);
    const itemA0 = items[0];
    await logTest('Item has id', !!itemA0.id, `ID: ${itemA0.id}`);
    await logTest('Item has artifactId', itemA0.artifactId === ARTIFACT_A);
    await logTest('Item has upgradeLevel', itemA0.upgradeLevel === 0);

    // Test 2: Add same artifact with upgrade level 1
    console.log('\n--- Test 2: Add same artifact with upgrade level 1 ---');
    await updateInventory([
      { artifactId: ARTIFACT_A, equipped: false, upgradeLevel: 0 },
      { artifactId: ARTIFACT_A, equipped: false, upgradeLevel: 1 }
    ]);
    items = await getInventoryItems();
    console.log('Items:', JSON.stringify(items, null, 2));
    await logTest('Two instances of same artifact', items.length === 2, `Items count: ${items.length}`);
    
    const itemA1 = items.find(i => i.upgradeLevel === 1);
    await logTest('Second instance has upgrade level 1', itemA1?.upgradeLevel === 1);
    await logTest('Both have different ids', itemA0.id !== itemA1?.id);

    // Test 3: Add artifact B and verify all three items exist
    console.log('\n--- Test 3: Add artifact B ---');
    await updateInventory([
      { artifactId: ARTIFACT_A, equipped: false, upgradeLevel: 0 },
      { artifactId: ARTIFACT_A, equipped: false, upgradeLevel: 1 },
      { artifactId: ARTIFACT_B, equipped: false, upgradeLevel: 0 }
    ]);
    items = await getInventoryItems();
    console.log('Items:', JSON.stringify(items, null, 2));
    await logTest('Three items in inventory', items.length === 3, `Items count: ${items.length}`);
    
    const artifactBItems = items.filter(i => i.artifactId === ARTIFACT_B);
    await logTest('Artifact B exists', artifactBItems.length === 1);

    // Test 4: Check database directly for structure
    console.log('\n--- Test 4: Verify database schema ---');
    const dbItems = await dbQuery(
      `SELECT id, hero_id, artifact_id, upgrade_level, equipped FROM inventory_schema.InventoryItems WHERE hero_id = $1`,
      [heroId]
    );
    await logTest('Items in database have id column', dbItems.rowCount >= 1 && dbItems.rows[0].id);
    await logTest('Items have no quantity column', !dbItems.rows[0].hasOwnProperty('quantity'));
    console.log('DB Items:', JSON.stringify(dbItems.rows, null, 2));

    // Test 5: Verify unique constraint (hero_id, artifact_id, upgrade_level)
    console.log('\n--- Test 5: Verify UNIQUE constraint ---');
    try {
      const result = await dbQuery(
        `INSERT INTO inventory_schema.InventoryItems (hero_id, artifact_id, upgrade_level, equipped) 
         VALUES ($1, $2, $3, false)`,
        [heroId, ARTIFACT_A, 0]
      );
      await logTest('UNIQUE constraint prevents duplicate', false, 'Expected constraint violation');
    } catch (err) {
      await logTest('UNIQUE constraint prevents duplicate', err.message.includes('UNIQUE') || err.message.includes('unique'));
    }

    // Test 6: Test equipped flag
    console.log('\n--- Test 6: Test equipped flag ---');
    await updateInventory([
      { artifactId: ARTIFACT_A, equipped: true, upgradeLevel: 0 },
      { artifactId: ARTIFACT_A, equipped: false, upgradeLevel: 1 }
    ]);
    items = await getInventoryItems();
    const equippedItem = items.find(i => i.upgradeLevel === 0);
    await logTest('Item can be marked as equipped', equippedItem?.equipped === true);

    console.log('\n✓ All tests completed');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ Test failed:', error.message);
    process.exit(1);
  } finally {
    if (db) await db.end();
  }
}

test();
