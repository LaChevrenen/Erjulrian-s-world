const axios = require('axios');

async function test() {
  try {
    const dungRes = await axios.post('http://localhost:3005/api/dungeons/start', {
      heroId: 'test-hero-' + Date.now(),
      heroStats: { level: 1, xp: 0, stats: { hp: 100, att: 10, def: 5, regen: 1 } },
      equippedArtifacts: []
    });
    
    const runId = dungRes.data.runId;
    let position = { floor: 0, room: 0 };
    
    console.log('Immediate call to /choices at F0R0:');
    let choicesRes = await axios.get(`http://localhost:3005/api/dungeons/${runId}/choices`);
    console.log('  Position:', choicesRes.data.debug.position);
    console.log('  Choices:');
    choicesRes.data.choices.forEach((c, i) => {
      console.log(`    [${i}] F${c.floor}R${c.room} Type: ${c.type}`);
    });
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();
