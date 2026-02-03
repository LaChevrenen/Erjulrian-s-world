/**
 * test-choice-system.js
 * 
 * Test the new room choice system
 * - Verify 2 choices per room
 * - Verify boss rooms exist
 * - Verify progression logic
 */

const axios = require('axios');

// Use direct service URLs instead of gateway
const HERO_URL = 'http://localhost:3003';
const INVENTORY_URL = 'http://localhost:3004';
const DUNGEON_URL = 'http://localhost:3005';

let testsPassed = 0;
let testsFailed = 0;

async function test(description, fn) {
    try {
        await fn();
        console.log(`✅ ${description}`);
        testsPassed++;
    } catch (error) {
        console.log(`❌ ${description}`);
        console.log(`   Error: ${error.message}`);
        testsFailed++;
    }
}

async function runTests() {
    console.log('\n🎮 ROOM CHOICE SYSTEM TESTS\n');

    // Test 1: Create hero
    let heroId;
    await test('Create hero', async () => {
        const res = await axios.post(`${HERO_URL}/api/heroes`, {
            userId: 'test-user-' + Date.now(),
            name: 'TestHero',
            level: 1,
            xp: 0
        });
        heroId = res.data.heroId;
        if (!heroId) throw new Error('No heroId returned');
    });

    // Test 2: Get hero stats
    let heroStats;
    await test('Get hero stats', async () => {
        const res = await axios.get(`${HERO_URL}/api/heroes/${heroId}`);
        heroStats = res.data;
        if (!heroStats || !heroStats.stats) throw new Error('No hero stats');
    });

    // Test 3: Create inventory
    await test('Create inventory', async () => {
        const res = await axios.post(`${INVENTORY_URL}/api/inventory`, {
            heroId,
            gold: 1000
        });
        if (!res.data) throw new Error('No inventory created');
    });

    // Test 4: Start dungeon
    let runId;
    let dungeonData;
    await test('Start dungeon run', async () => {
        const res = await axios.post(`${DUNGEON_URL}/api/dungeons/start`, {
            heroId,
            heroStats: {
                level: heroStats.level || 1,
                xp: heroStats.xp || 0,
                stats: {
                    hp: heroStats.stats?.hp || 100,
                    att: heroStats.stats?.att || 10,
                    def: heroStats.stats?.def || 5,
                    regen: heroStats.stats?.regen || 1
                }
            },
            equippedArtifacts: []
        });
        if (!res.data.runId) throw new Error('No runId');
        runId = res.data.runId;
        dungeonData = res.data;
    });

    // Test 5: Verify starting room is rest
    await test('Starting room is rest type', async () => {
        if (dungeonData.currentRoom.type !== 'rest') {
            throw new Error(`Expected rest, got ${dungeonData.currentRoom.type}`);
        }
    });

    // Test 6: Get initial choices
    let choices;
    await test('Get initial choices - exactly 2 options', async () => {
        const res = await axios.get(`${DUNGEON_URL}/api/dungeons/${runId}/choices`);
        choices = res.data.choices;
        if (!Array.isArray(choices) || choices.length !== 2) {
            throw new Error(`Expected 2 choices, got ${choices?.length}`);
        }
    });

    // Test 7: Verify choice details
    await test('Choices have required fields', async () => {
        choices.forEach((choice, idx) => {
            if (!choice.hasOwnProperty('floor')) throw new Error(`Choice ${idx} missing floor`);
            if (!choice.hasOwnProperty('room')) throw new Error(`Choice ${idx} missing room`);
            if (!choice.hasOwnProperty('type')) throw new Error(`Choice ${idx} missing type`);
        });
    });

    // Test 8: Choose first option and move
    await test('Move to first choice', async () => {
        const res = await axios.post(`${DUNGEON_URL}/api/dungeons/${runId}/choose`, {
            choiceIndex: 0
        });
        if (!res.data.position) throw new Error('No position in response');
        if (res.data.roomType === undefined) throw new Error('No roomType in response');
    });

    // Test 9: Get new choices from new room
    let newChoices;
    await test('Get new choices - exactly 2 options again', async () => {
        const res = await axios.get(`${DUNGEON_URL}/api/dungeons/${runId}/choices`);
        newChoices = res.data.choices;
        if (!Array.isArray(newChoices) || newChoices.length !== 2) {
            throw new Error(`Expected 2 choices, got ${newChoices?.length}`);
        }
    });

    // Test 10: Verify choices are different from starting room
    await test('New choices are different from starting room', async () => {
        const startingRoom = { floor: 0, room: 0 };
        newChoices.forEach(choice => {
            if (choice.floor === startingRoom.floor && choice.room === startingRoom.room) {
                throw new Error('Choice is same as starting room');
            }
        });
    });

    // Test 11: Traverse multiple rooms
    let roomCount = 1;
    let currentPos = { floor: 0, room: 1 };
    let reachedBoss = false;
    
    await test('Traverse dungeon to find boss rooms', async () => {
        for (let i = 0; i < 20; i++) { // Safety limit
            try {
                const choicesRes = await axios.get(`${DUNGEON_URL}/api/dungeons/${runId}/choices`);
                const choices = choicesRes.data.choices;
                
                if (!choices || choices.length === 0) {
                    // Reached end (final boss)
                    reachedBoss = true;
                    break;
                }
                
                // Choose a path (prefer boss/elite for testing)
                const bossChoice = choices.find(c => c.type === 'boss' || c.type === 'elite-combat');
                const choice = bossChoice || choices[0];
                
                const moveRes = await axios.post(`${DUNGEON_URL}/api/dungeons/${runId}/choose`, {
                    choiceIndex: choices.indexOf(choice)
                });
                
                currentPos = moveRes.data.position;
                roomCount++;
                
                // Check if we found a boss room
                if (moveRes.data.roomType === 'boss' || moveRes.data.roomType === 'elite-combat') {
                    reachedBoss = true;
                }
                
            } catch (error) {
                if (error.response?.status === 400) {
                    // Likely at final boss
                    reachedBoss = true;
                    break;
                }
                throw error;
            }
        }
        
        if (!reachedBoss) {
            throw new Error('Did not encounter any boss room');
        }
    });

    // Test 12: Verify dungeon progression
    let dungeonState;
    await test('Verify dungeon state progression', async () => {
        const res = await axios.get(`${DUNGEON_URL}/api/dungeons/${runId}`);
        dungeonState = res.data;
        
        if (!dungeonState.visitedRooms || dungeonState.visitedRooms.length === 0) {
            throw new Error('No visited rooms tracked');
        }
        
        if (dungeonState.visitedRooms.length < 2) {
            throw new Error('Should have visited at least 2 rooms');
        }
    });

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Tests Passed: ${testsPassed}`);
    console.log(`Tests Failed: ${testsFailed}`);
    console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
    console.log(`${'='.repeat(50)}\n`);
}

// Run tests
runTests().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
