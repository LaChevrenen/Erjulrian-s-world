// Test generateChoices directly
function pickRandomMonsterId() {
    return Math.random() > 0.5 ? 'monster-a' : 'monster-b';
}

let monsterIdCache = ['m1', 'm2', 'm3'];

function generateChoices(currentFloor, currentRoom, allRooms) {
    const FLOORS = 3;
    const ROOMS_PER_FLOOR = 5;
    const maxFloor = FLOORS - 1;
    const maxRoom = ROOMS_PER_FLOOR - 1;
    
    const isLastRoom = currentFloor === maxFloor && currentRoom === maxRoom;
    if (isLastRoom) {
        return [];
    }
    
    let nextFloor = currentFloor;
    let nextRoom = currentRoom + 1;
    
    if (nextRoom > maxRoom) {
        nextFloor++;
        nextRoom = 0;
    }
    
    const nextRoomTemplate = allRooms.find(r => r.floor === nextFloor && r.room === nextRoom);
    if (!nextRoomTemplate) return [];
    
    const choices = [];
    
    if (nextRoom === maxRoom) {
        const boss1Monster = pickRandomMonsterId();
        const boss2Monster = pickRandomMonsterId();
        
        choices.push({
            floor: nextFloor,
            room: nextRoom,
            type: nextRoomTemplate.type,
            monsterId: boss1Monster,
            visited: false
        });
        
        choices.push({
            floor: nextFloor,
            room: nextRoom,
            type: nextRoomTemplate.type,
            monsterId: boss2Monster,
            visited: false
        });
    } else {
        const type1 = 'combat';
        const type2 = 'rest';
        
        choices.push({
            floor: nextFloor,
            room: nextRoom,
            type: type1,
            monsterId: pickRandomMonsterId(),
            visited: false
        });
        
        choices.push({
            floor: nextFloor,
            room: nextRoom,
            type: type2,
            monsterId: null,
            visited: false
        });
    }
    
    return choices;
}

// Create mock allRooms
const allRooms = [];
for (let f = 0; f < 3; f++) {
    for (let r = 0; r < 5; r++) {
        let type;
        if (f === 0 && r === 0) type = 'rest';
        else if (r === 4) type = f === 2 ? 'boss' : 'elite-combat';
        else type = Math.random() < 0.6 ? 'combat' : 'rest';
        
        allRooms.push({ floor: f, room: r, type, visited: false });
    }
}

console.log('Test 1: At F0R3, what are the choices?');
let choices = generateChoices(0, 3, allRooms);
choices.forEach((c, i) => {
    console.log(`  [${i}] F${c.floor}R${c.room} Type: ${c.type} Monster: ${c.monsterId || 'null'}`);
});

console.log('\nTest 2: At F0R4, what are the choices?');
choices = generateChoices(0, 4, allRooms);
if (choices.length === 0) {
    console.log('  No choices (should move to F1R0)');
} else {
    choices.forEach((c, i) => {
        console.log(`  [${i}] F${c.floor}R${c.room} Type: ${c.type} Monster: ${c.monsterId || 'null'}`);
    });
}
