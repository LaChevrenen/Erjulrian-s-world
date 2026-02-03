const axios = require('axios');

async function test() {
  try {
    const dungRes = await axios.post('http://localhost:3005/api/dungeons/start', {
      heroId: 'test-hero-' + Math.random().toString(36).substr(2, 9),
      heroStats: { level: 1, xp: 0, stats: { hp: 100, att: 10, def: 5, regen: 1 } },
      equippedArtifacts: []
    });
    
    const runId = dungRes.data.runId;
    console.log('🎮 NAVIGATING TO BOSS ROOM (F0R4)\n');
    
    let position = { floor: 0, room: 0 };
    
    // Navigate to room 4 (boss room)
    for (let step = 0; step < 4; step++) {
      const choicesRes = await axios.get(`http://localhost:3005/api/dungeons/${runId}/choices`);
      const choices = choicesRes.data.choices;
      
      console.log(`Step ${step}: At F${position.floor}R${position.room}`);
      choices.forEach((c, i) => {
        const hasMonster = c.monsterId ? 'YES' : 'NO';
        console.log(`  [${i}] F${c.floor}R${c.room} Type: ${c.type.padEnd(13)} Monster: ${hasMonster}`);
      });
      
      // Always pick choice 0
      const moveRes = await axios.post(`http://localhost:3005/api/dungeons/${runId}/choose`, {
        choiceIndex: 0
      });
      
      position = moveRes.data.position;
      console.log(`  → Chose [0], now at F${position.floor}R${position.room}\n`);
    }
    
    // Now at room 4 (boss room), check the choices for room 4's options
    console.log('🎯 NOW AT BOSS ROOM F0R4');
    const choicesRes = await axios.get(`http://localhost:3005/api/dungeons/${runId}/choices`);
    const choices = choicesRes.data.choices;
    
    if (choices.length === 0) {
      console.log('✗ No choices (probably room 4 of floor 2)');
    } else {
      console.log(`Showing choices for next room (F${choices[0].floor}R${choices[0].room}):`);
      choices.forEach((c, i) => {
        const hasMonster = c.monsterId ? '✓ YES' : '✗ NO';
        console.log(`  [${i}] Type: ${c.type.padEnd(13)} Monster: ${hasMonster}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();
