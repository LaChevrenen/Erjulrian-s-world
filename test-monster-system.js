#!/usr/bin/env node

const axios = require('axios');
const { randomUUID } = require('crypto');

async function test() {
  try {
    console.log('\n🧪 TESTING NEW MONSTER SYSTEM\n');
    console.log('='.repeat(50));
    
    const userId = randomUUID();
    
    // Create hero
    console.log('\n1️⃣ Creating hero...');
    const heroRes = await axios.post('http://localhost:3003/api/heroes', { userId });
    const heroId = heroRes.data.heroId;
    console.log('   ✅ Hero created');
    
    // Get hero stats
    console.log('\n2️⃣ Getting hero stats...');
    const getRes = await axios.get(`http://localhost:3003/api/heroes/${heroId}`);
    console.log('   ✅ Stats retrieved');
    
    // Start dungeon
    console.log('\n3️⃣ Starting dungeon...');
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
    console.log('   ✅ Dungeon created\n');
    
    // Analyze room structure
    console.log('📊 ROOM ANALYSIS:');
    console.log('='.repeat(50));
    
    const types = {};
    dungRes.data.rooms.forEach(r => {
      types[r.type] = (types[r.type] || 0) + 1;
    });
    
    console.log('\n📋 Room Type Distribution:');
    Object.entries(types).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
    
    // Check final boss
    console.log('\n👑 FINAL BOSS ROOM (Floor 2, Room 4):');
    const finalBoss = dungRes.data.rooms.find(r => r.floor === 2 && r.room === 4);
    console.log(`   Type: ${finalBoss.type}`);
    console.log(`   Has Monster: ${finalBoss.monsterId ? '✅ YES' : '❌ NO'}`);
    console.log(`   Monster ID: ${finalBoss.monsterId || 'null'}`);
    
    // Check elite combat rooms
    const elites = dungRes.data.rooms.filter(r => r.type === 'elite-combat');
    console.log(`\n⚔️  ELITE COMBAT ROOMS (${elites.length} total):`);
    elites.forEach(r => {
      const hasMonstre = r.monsterId ? '✅' : '❌';
      console.log(`   Floor ${r.floor}, Room ${r.room}: ${hasMonstre} Monster`);
    });
    
    // Check regular combat rooms
    const combats = dungRes.data.rooms.filter(r => r.type === 'combat');
    console.log(`\n🗡️  REGULAR COMBAT ROOMS (${combats.length} total):`);
    combats.slice(0, 3).forEach(r => {
      const hasMonster = r.monsterId ? '✅' : '❌';
      console.log(`   Floor ${r.floor}, Room ${r.room}: ${hasMonster} Monster`);
    });
    if (combats.length > 3) console.log(`   ... and ${combats.length - 3} more`);
    
    // Check rest rooms
    const rests = dungRes.data.rooms.filter(r => r.type === 'rest');
    console.log(`\n😌 REST ROOMS (${rests.length} total):`);
    rests.slice(0, 3).forEach(r => {
      const hasMonster = r.monsterId ? '⚠️' : '✅';
      console.log(`   Floor ${r.floor}, Room ${r.room}: ${hasMonster} No Monster`);
    });
    
    console.log('\n' + '='.repeat(50));
    console.log('✅ MONSTER SYSTEM TEST COMPLETE');
    console.log('='.repeat(50) + '\n');
    
  } catch (error) {
    console.error('\n❌ ERROR:', error.response?.data?.error || error.message);
    if (error.response?.data) console.error('Details:', error.response.data);
    process.exit(1);
  }
}

// Wait for services to be ready, then test
setTimeout(test, 3000);
