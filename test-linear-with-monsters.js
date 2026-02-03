const axios = require('axios');

async function test() {
  try {
    const userId = '123e4567-e89b-12d3-a456-426614174' + Math.random().toString(36).substr(2, 3);
    const heroRes = await axios.post('http://localhost:3003/api/heroes', {
      userId,
      name: 'TestHero'
    });
    const heroId = heroRes.data.heroId;
    
    const dungRes = await axios.post('http://localhost:3005/api/dungeons/start', {
      heroId,
      heroStats: { level: 1, xp: 0, stats: { hp: 100, att: 10, def: 5, regen: 1 } },
      equippedArtifacts: []
    });
    
    const runId = dungRes.data.runId;
    console.log('🎮 LINEAR PROGRESSION TEST WITH PROPER MONSTER IDs\n');
    
    let position = { floor: 0, room: 0 };
    let visitedBossRooms = [];
    
    for (let step = 0; step < 6; step++) {
      const choicesRes = await axios.get(`http://localhost:3005/api/dungeons/${runId}/choices`);
      const choices = choicesRes.data.choices;
      
      if (!choices || choices.length === 0) {
        console.log('✅ Reached BOSS FINAL - no more choices');
        break;
      }
      
      console.log(`Step ${step} - At Floor ${position.floor} Room ${position.room}`);
      console.log(`  2 choices for Floor ${choices[0].floor} Room ${choices[0].room}:`);
      choices.forEach((c, i) => {
        const monsterType = c.monsterId ? '✓ MONSTER' : '✗ NO MONSTER';
        console.log(`    [${i}] Type: ${c.type.padEnd(13)} ${monsterType}`);
        
        // Track boss rooms
        if (c.room === 4) {
          visitedBossRooms.push({
            position: `F${c.floor}R${c.room}`,
            type: c.type,
            choice: i,
            monsterId: c.monsterId
          });
        }
      });
      
      // Pick first choice
      const moveRes = await axios.post(`http://localhost:3005/api/dungeons/${runId}/choose`, {
        choiceIndex: 0
      });
      
      position = moveRes.data.position;
      console.log(`  → Chose [0], moved to Floor ${position.floor} Room ${position.room}\n`);
    }
    
    console.log('📊 BOSS ROOM SUMMARY:');
    visitedBossRooms.forEach(br => {
      console.log(`  ${br.position} (${br.type}): Choice ${br.choice} got monster ${br.monsterId}`);
    });
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();
