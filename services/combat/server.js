const amqp = require('amqplib'); // Pour RabbitMQ

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';

let logChannel;
let combatChannel;

// RabbitMQ connection
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(RABBITMQ_URL);
        logChannel = await connection.createChannel();
        const queue = 'log_queue';
        await logChannel.assertQueue(queue, { durable: true });
        console.log('Combat service connected to RabbitMQ');
    } catch (error) {
        console.error('Failed to connect to RabbitMQ:', error);
        setTimeout(connectRabbitMQ, 5000);
    }
}

// Send log to log service via RabbitMQ
async function sendLog(heroId, level, eventType, payload) {
    if (!logChannel) return;
    
    try {
        const logData = {
            user_id: heroId,
            level: level,
            timestamp: new Date().toISOString(),
            service: 'combat',
            eventType: eventType,
            payload: payload
        };
        
        logChannel.sendToQueue('log_queue', Buffer.from(JSON.stringify(logData)), { persistent: true });
    } catch (error) {
        console.error('Failed to send log:', error);
    }
}

async function start() {
    await connectRabbitMQ();
    
    const connection = await amqp.connect(RABBITMQ_URL);
    combatChannel = await connection.createChannel();
    
    const queue = 'combat_queue';
    await combatChannel.assertQueue(queue, { durable: true });

    const resultQueue = 'combat_result_queue';
    await combatChannel.assertQueue(resultQueue, { durable: true });

    const heroQueue = 'hero_queue';
    const inventoryQueue = 'inventory_queue';
    await combatChannel.assertQueue(heroQueue, { durable: true });
    await combatChannel.assertQueue(inventoryQueue, { durable: true });

    console.log("Service de combat en attente de messages...");

    combatChannel.consume(queue, async (msg) => {
        const combatData = JSON.parse(msg.content.toString());
        const heroId = combatData.hero.heroId;
        const monsterName = combatData.monster.name;
        
        console.log("Combat reçu :", combatData);
        await sendLog(heroId, 'info', 'combat_start', { monsterName, monsterType: combatData.monster.type });

        const battleResult = computeBattle(combatData);
        
        // send message to another queue
        combatChannel.sendToQueue(resultQueue, Buffer.from(JSON.stringify(battleResult)), { persistent: true });

        console.log("Résultat du combat envoyé :", battleResult);
        
        // Log combat result
        const logLevel = battleResult.result === 'win' ? 'info' : 'warn';
        await sendLog(heroId, logLevel, 'combat_end', { 
            result: battleResult.result, 
            monsterName, 
            lootCount: (battleResult.loot || []).length 
        });

        combatChannel.ack(msg);

    }, { noAck: false });

    // Consumer for combat results -> apply hero/inventory updates
    combatChannel.consume(resultQueue, async (msg) => {
        const result = JSON.parse(msg.content.toString());

        try {
            if (result.result === 'win') {
                const xpDelta = result.xpDelta || 0;
                const goldDelta = result.goldDelta || 0;
                const itemsToAdd = (result.loot || []).map(l => ({
                    artifactId: l.artifactId,
                    quantity: l.amount || 1
                }));

                // Update hero
                combatChannel.sendToQueue('hero_queue', Buffer.from(JSON.stringify({
                    action: 'update_hero',
                    heroId: result.heroId,
                    xpDelta,
                    hpDelta: 0
                })), { persistent: true });

                // Update inventory
                combatChannel.sendToQueue('inventory_queue', Buffer.from(JSON.stringify({
                    action: 'update_inventory',
                    heroId: result.heroId,
                    goldDelta,
                    itemsToAdd,
                    itemsToRemove: []
                })), { persistent: true });
            }
        } catch (error) {
            console.error('Failed to apply combat result:', error);
        }

        combatChannel.ack(msg);
    }, { noAck: false });
}

function battleTest()
{
        const combatDataSimulation = {
            "hero": {
            "heroId": "12345678",
            "level": 1,
            "xp": 0,
            "stats": {
                "hp": 20,
                "att": 4,
                "def": 1,
                "regen": 1
            }
        },
        "monster": {
            "id": "666",
            "name": "Goblin soldier",
            "type": "Goblin",
            "description": "The most common type of goblin found in the wilds.",
        "stats": {
            "hp": 10,
            "att": 2,
            "def": 1,
            "regen": 0
        },
        "lootTable": [
            {
                "artifactId": "550e8400-e29b-41d4-a716-446655440501",
                "chance": 0.5,
                "amount": 1
            },
            {
                "artifactId": "550e8400-e29b-41d4-a716-446655440502",
                "chance": 0.2,
                "amount": 1
            }]
        }};

        console.log("Testing win battle");
        const battleResult = computeBattle(combatDataSimulation);
        console.log("Battle result:", battleResult);

        console.log("Testing lose battle");
        combatDataSimulation.monster.stats.att = 10;
        const battleResultLose = computeBattle(combatDataSimulation);
        console.log("Battle result:", battleResultLose);
}

function computeBattle(combatData) 
{
    if (!assertDataStructure(combatData))
    {
        throw new Error("Invalid combat data structure");
    }

    // Extract stats only needed for battle
    const heroStats = combatData.hero.stats;
    const monsterStats = combatData.monster.stats;

    let heroHp = heroStats.hp;
    let heroAtt = heroStats.att;
    let heroDef = heroStats.def;
    let heroRegen = heroStats.regen;

    let monsterHp = monsterStats.hp;
    let monsterAtt = monsterStats.att;
    let monsterDef = monsterStats.def;
    let monsterRegen = monsterStats.regen;

    let round = 0;

    // extract stats needed for logging
    let monsterName = combatData.monster.name;

    // Loop until one of them is defeated
    while (heroHp > 0 && monsterHp > 0)
    {
        // Hero attacks monster
        const damageToMonster = Math.max(0, heroAtt - monsterDef);
        monsterHp -= damageToMonster;
        console.log(`Round ${round}: you deals ${damageToMonster} damage to ${monsterName}. ${monsterName} HP: ${monsterHp}`);

        if (monsterHp <= 0) break; // Monster defeated

        // Monster attacks hero
        const damageToHero = Math.max(0, monsterAtt - heroDef);
        heroHp -= damageToHero;
        console.log(`Round ${round}: ${monsterName} deals ${damageToHero} damage to you. Your HP: ${heroHp}`);

        if (heroHp <= 0) break; // Hero defeated

        // Both regenerate
        heroHp += heroRegen;
        monsterHp += monsterRegen;

        round++;
        // After 10 round enemys get boosted
        if (round % 10 === 0) {
            console.log(`${monsterName} gets stronger!`);
            monsterAtt += 1;
            monsterDef += 1;
        }
    }

    // Determine the winner

    let battleJson = {
        heroId: combatData.hero.heroId
    };

    if (heroHp > 0) {
        battleJson.result = "win";
    } else {
        battleJson.result = "lose";
    }

    // Compyte battle loot if hero wins
    if (battleJson.result === "win") {
        const lootGained = [];
        for (const loot of combatData.monster.lootTable) {
            if (Math.random() < loot.chance) {
                lootGained.push({
                    artifactId: loot.artifactId,
                    chance: loot.chance,
                    amount: loot.amount
                });
            }
        }
        battleJson.loot = lootGained;
        const rewards = calculateRewards(combatData.monster.stats);
        battleJson.xpDelta = rewards.xpDelta;
        battleJson.goldDelta = rewards.goldDelta;
    }
    else 
    {
        battleJson.loot = [];
        battleJson.xpDelta = 0;
        battleJson.goldDelta = 0;
    }

    return battleJson;
}

function calculateRewards(stats) {
    const base = Math.max(1, (stats?.hp || 0) + (stats?.att || 0) + (stats?.def || 0) + (stats?.regen || 0));
    return {
        xpDelta: Math.max(1, Math.floor(base / 2)),
        goldDelta: Math.max(0, Math.floor(base / 4))
    };
}

function assertDataStructure(data)
{
    // Check that both hero and monster are present
    if (!data.hero || !data.monster) {
        return false;
    }

    // Check hero structure
    const hero = data.hero;
    if (typeof hero.heroId !== 'string' || typeof hero.level !== 'number' || typeof hero.xp !== 'number') {
        return false;
    }

    // Check hero stats structure
    const heroStats = hero.stats;
    if (typeof heroStats.hp !== 'number' || typeof heroStats.att !== 'number' ||
        typeof heroStats.def !== 'number' || typeof heroStats.regen !== 'number') {
        return false;
    }

    // Check monster structure
    const monster = data.monster;
    if (typeof monster.id !== 'string' || typeof monster.name !== 'string' ||
        typeof monster.type !== 'string' || typeof monster.description !== 'string') {
        return false;
    }

    // Check monster stats structure
    const monsterStats = monster.stats;
    if (typeof monsterStats.hp !== 'number' || typeof monsterStats.att !== 'number' ||
        typeof monsterStats.def !== 'number' || typeof monsterStats.regen !== 'number') {
        return false;
    }

    // Check loot table structure
    if (!Array.isArray(monster.lootTable)) {
        return false;
    }
    for (const loot of monster.lootTable) {
        if (typeof loot.artifactId !== 'string' || typeof loot.chance !== 'number' ||
            typeof loot.amount !== 'number') {
            return false;
        }
    }

    return true;
}

start();
// battleTest();