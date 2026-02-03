#!/usr/bin/env node

const axios = require('axios');
const { randomUUID } = require('crypto');

async function test() {
  try {
    console.log('\n🎮 TESTING ROOM PROGRESSION WITH CHOICES\n');
    console.log('='.repeat(60));
    
    const userId = randomUUID();
    const heroRes = await axios.post('http://localhost:3003/api/heroes', { userId });
    const heroId = heroRes.data.heroId;
    const getRes = await axios.get(`http://localhost:3003/api/heroes/${heroId}`);
    
    const dungRes = await axios.post('http://localhost:3005/api/dungeons/start', {
      heroId,
      heroStats: {
        level: getRes.data.level,
        xp: getRes.data.xp,
        stats: {
          hp: getRes.data.base_hp,
          current_hp: getRes.data.current_hp,
          att: getRes.data.base_att,
          def: getRes.data.base_def,
          regen: getRes.data.base_regen
        }
      },
      equippedArtifacts: []
    });
    
    const runId = dungRes.data.runId;
    let position = { floor: 0, room: 0 };
    
    console.log('Starting at Floor 0, Room 0 (rest room)\n');
    
    // Move through several rooms
    for (let step = 0; step < 3; step++) {
      // Get choices
      const choicesRes = await axios.get(`http://localhost:3005/api/dungeons/${runId}/choices`);
      const choices = choicesRes.data.choices;
      
      console.log(`Step ${step + 1}: Current Position = Floor ${position.floor}, Room ${position.room}`);
      console.log('Available choices for next room:');
      choices.forEach((c, i) => {
        const monster = c.monsterId ? '✅ HAS MONSTER' : '❌ NO MONSTER';
        console.log(`  [${i}] Floor ${c.floor}, Room ${c.room} (${c.type}) - ${monster}`);
      });
      
      // Choose first option
      const chooseRes = await axios.post(`http://localhost:3005/api/dungeons/${runId}/choose`, {
        choiceIndex: 0,
        heroStats: {
          hp: getRes.data.base_hp,
          current_hp: getRes.data.current_hp,
          att: getRes.data.base_att,
          def: getRes.data.base_def,
          regen: getRes.data.base_regen
        }
      });
      
      position = chooseRes.data.position;
      console.log(`✓ Chose option [0] → Moved to Floor ${position.floor}, Room ${position.room}\n`);
    }
    
    console.log('='.repeat(60));
    console.log('✅ Room progression with choices works correctly!');
    console.log('='.repeat(60) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data?.error || error.message);
    process.exit(1);
  }
}

test();
