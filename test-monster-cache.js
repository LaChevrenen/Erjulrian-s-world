const axios = require('axios');

async function test() {
  try {
    const dungRes = await axios.post('http://localhost:3005/api/dungeons/start', {
      heroId: 'fixed-hero-id-for-testing',
      heroStats: { level: 1, xp: 0, stats: { hp: 100, att: 10, def: 5, regen: 1 } },
      equippedArtifacts: []
    });
    
    const runId = dungRes.data.runId;
    console.log('🎮 TEST: Check if generateChoices has monsterIdCache\n');
    
    // Call /choices immediately
    const choicesRes = await axios.get(`http://localhost:3005/api/dungeons/${runId}/choices`);
    const choices = choicesRes.data.choices;
    
    console.log('Choices from Floor 0 Room 0 (for Floor 0 Room 1):');
    choices.forEach((c, i) => {
      console.log(`  [${i}] Type: ${c.type}, monsterId: ${c.monsterId || 'null'}`);
    });
    
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

test();
