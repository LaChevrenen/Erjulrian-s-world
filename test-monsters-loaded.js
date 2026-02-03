const axios = require('axios');

async function test() {
  try {
    const dungRes = await axios.post('http://localhost:3005/api/dungeons/start', {
      heroId: '123e4567-e89b-12d3-a456-426614174000',
      heroStats: { level: 1, xp: 0, stats: { hp: 100, att: 10, def: 5, regen: 1 } },
      equippedArtifacts: []
    });
    
    console.log('✅ MONSTERS NOW LOADED:');
    dungRes.data.rooms.filter(r => r.type !== 'rest').forEach(r => {
      console.log(`  Floor ${r.floor} Room ${r.room} (${r.type}): monsterId = ${r.monsterId ? '✓ YES' : '✗ NO'}`);
    });
  } catch (error) {
    console.error('Error:', error.message);
  }
}

test();
