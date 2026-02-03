#!/usr/bin/env node

const axios = require('axios');
const { randomUUID } = require('crypto');

async function test() {
  try {
    console.log('\n🏰 REACHING THE FINAL BOSS\n');
    console.log('='.repeat(70));
    
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
    let step = 0;
    
    console.log('Starting at F0R0...\n');
    
    // Navigate through the dungeon
    while (true) {
      // Get choices
      const choicesRes = await axios.get(`http://localhost:3005/api/dungeons/${runId}/choices`);
      const choices = choicesRes.data.choices;
      
      if (choices.length === 0) {
        console.log(`\n✅ FINAL BOSS REACHED at Floor ${position.floor}, Room ${position.room}!`);
        break;
      }
      
      step++;
      console.log(`Step ${step}: F${position.floor}R${position.room} → `, 'Next: ', choices[0].type);
      
      // If approaching final boss, show more info
      if (choices[0].floor === 2 && choices[0].room === 4) {
        console.log('   🚨 BOSS ROOM AHEAD! Choices:');
        choices.forEach((c, i) => {
          console.log(`      [${i}] ${c.type} - Monster: ${c.monsterId ? '✅' : '❌'}`);
        });
      }
      
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
      
      if (step > 20) {
        console.error('❌ Too many steps, breaking');
        break;
      }
    }
    
    console.log('='.repeat(70));
    console.log('✅ NAVIGATION TEST COMPLETE');
    console.log('='.repeat(70) + '\n');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data?.error || error.message);
    process.exit(1);
  }
}

test();
