const axios = require('axios');
const crypto = require('crypto');

// API endpoints
const USER_API = 'http://localhost:3001';
const HERO_API = 'http://localhost:3003/api';
const INVENTORY_API = 'http://localhost:3004/api';
const DUNGEON_API = 'http://localhost:3005/api';

let userId;
let heroId;
let runId;

async function log(message, data = '') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${message}${data ? ` → ${JSON.stringify(data)}` : ''}`);
}

async function createUser() {
  try {
    const response = await axios.post(`${USER_API}/user`, {
      name: `test_${Date.now()}`,
      isAdmin: false
    });
    userId = response.data.id;
    await log('✓ User created', userId);
  } catch (error) {
    await log('✗ User creation failed', error.response?.data || error.message);
    throw error;
  }
}

async function createHero() {
  try {
    const response = await axios.post(`${HERO_API}/heroes`, {
      userId: userId
    });
    heroId = response.data.heroId;
    await log('✓ Hero created', heroId);
  } catch (error) {
    await log('✗ Hero creation failed', error.response?.data || error.message);
    throw error;
  }
}

async function getHero() {
  try {
    const response = await axios.get(`${HERO_API}/heroes/${heroId}`);
    return response.data;
  } catch (error) {
    await log('✗ Get hero failed', error.message);
    throw error;
  }
}

async function getInventory() {
  try {
    const response = await axios.get(`${INVENTORY_API}/inventory/${heroId}`);
    return response.data;
  } catch (error) {
    await log('✗ Get inventory failed', error.message);
    throw error;
  }
}

async function startDungeon(hero) {
  try {
    const payload = {
      heroId: heroId,
      heroStats: {
        level: hero.level,
        xp: hero.xp,
        stats: {
          hp: hero.base_hp,
          current_hp: hero.current_hp,
          att: hero.base_att,
          def: hero.base_def,
          regen: hero.base_regen
        }
      },
      equippedArtifacts: []
    };
    console.log('DEBUG: Sending to dungeon:', JSON.stringify(payload.heroStats, null, 2));
    const response = await axios.post(`${DUNGEON_API}/dungeons/start`, payload);
    runId = response.data.runId;
    await log('✓ Dungeon started', runId);
    return response.data;
  } catch (error) {
    await log('✗ Dungeon start failed', error.response?.data || error.message);
    throw error;
  }
}

async function getChoices() {
  try {
    const response = await axios.get(`${DUNGEON_API}/dungeons/${runId}/choices`);
    return response.data.choices;
  } catch (error) {
    await log('✗ Get choices failed', error.message);
    throw error;
  }
}

async function chooseRoom(choiceIndex) {
  try {
    const response = await axios.post(`${DUNGEON_API}/dungeons/${runId}/choose`, {
      choiceIndex: choiceIndex
    });
    return response.data;
  } catch (error) {
    await log('✗ Choose room failed', error.response?.data || error.message);
    throw error;
  }
}

async function test() {
  try {
    console.log('\n════════════════════════════════════════');
    console.log('  FULL GAME FLOW TEST');
    console.log('════════════════════════════════════════\n');

    // Step 1: Create user and hero
    await log('Step 1: Create user and hero');
    await createUser();
    await createHero();

    // Step 2: Get initial hero stats
    await log('\nStep 2: Get initial hero stats');
    let hero = await getHero();
    await log('Hero stats', {
      level: hero.level,
      xp: hero.xp,
      hp: hero.base_hp,
      current_hp: hero.current_hp
    });

    // Step 3: Get initial inventory (optional - may not exist yet)
    await log('\nStep 3: Check inventory');
    let inventory;
    try {
      inventory = await getInventory();
      await log('Inventory found', {
        gold: inventory.gold,
        items_count: inventory.items?.length || 0
      });
    } catch (e) {
      await log('Inventory not yet initialized (this is normal)', '');
    }

    // Step 4: Start dungeon
    await log('\nStep 4: Start dungeon run');
    let dungeon = await startDungeon(hero);
    await log('Dungeon position', {
      floor: dungeon.position.floor,
      room: dungeon.position.room
    });

    // Step 5: Navigate through rooms
    await log('\nStep 5: Navigate through rooms');
    for (let i = 0; i < 3; i++) {
      const choices = await getChoices();
      await log(`Room ${i + 1}: Got choices`, {
        choice_count: choices.length,
        types: choices.map(c => `${c.type}${c.monsterId ? ' (monster)' : ''}`)
      });

      // Pick combat room when available
      const combatChoice = choices.findIndex(c => c.type === 'combat');
      const choiceIdx = combatChoice !== -1 ? combatChoice : 0;
      
      const room = await chooseRoom(choiceIdx);
      await log(`Chose room ${choiceIdx}`, {
        floor: room.position.floor,
        room: room.position.room,
        type: room.roomType
      });

      // Wait a bit for combat processing
      if (room.roomType === 'combat') {
        await log('Waiting for combat to process...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    // Step 6: Get hero stats after combat
    await log('\nStep 6: Check hero stats after combat');
    hero = await getHero();
    await log('Updated hero stats', {
      level: hero.level,
      xp: hero.xp,
      current_hp: hero.current_hp,
      base_hp: hero.base_hp
    });

    if (hero.current_hp < hero.base_hp) {
      await log('✓ Hero took damage in combat', {
        damage: hero.base_hp - hero.current_hp
      });
    }

    if (hero.xp > 0) {
      await log('✓ Hero gained XP', hero.xp);
    }

    // Step 7: Verify inventory (if initialized)
    await log('\nStep 7: Verify inventory');
    try {
      inventory = await getInventory();
      await log('Final inventory', {
        gold: inventory.gold,
        items_count: inventory.items?.length || 0
      });
    } catch (e) {
      await log('Inventory still not initialized', '');
    }

    console.log('\n════════════════════════════════════════');
    console.log('  ✓ ALL TESTS PASSED');
    console.log('════════════════════════════════════════\n');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ TEST FAILED:', error.message);
    process.exit(1);
  }
}

// Wait for services to be ready
setTimeout(test, 5000);
