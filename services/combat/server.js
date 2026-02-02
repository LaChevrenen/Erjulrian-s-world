const amqp = require('amqplib'); // Pour RabbitMQ

let logChannel;

// RabbitMQ connection
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://rabbitmq:5672');
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
    
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();
    
    const queue = 'combat_queue';
    await channel.assertQueue(queue, { durable: true });

    console.log("Service de combat en attente de messages...");

    channel.consume(queue, async (msg) => {
        // handle parse error
        let combatData;
        try {
            combatData = JSON.parse(msg.content.toString());
        } catch (error) {
            console.error("Erreur de parsing du message de combat:", error);
            channel.ack(msg); // Acknowledge message to remove it from the queue
            return;
        }
        const heroId = combatData.hero.heroId;
        const monsterName = combatData.monster.name;
        
        console.log("Combat reçu :", combatData);
        await sendLog(heroId, 'info', 'combat_start', { monsterName, monsterType: combatData.monster.type });

        // compuet battle and handle wrong data structure
        let battleResult;
        try {
            battleResult = computeBattle(combatData);
        } catch (error) {
            console.error("Unable to process combat data:", error);
            await sendLog(heroId, 'error', 'combat_error', { error: error.message });
            channel.ack(msg); // Acknowledge message to remove it from the queue
            return;
        }

        // send message to another queue
        const resultQueue = 'combat_result_queue';
        channel.assertQueue(resultQueue, { durable: true });
        channel.sendToQueue(resultQueue, Buffer.from(JSON.stringify(battleResult)), { persistent: true });
        console.log("Résultat du combat envoyé :", battleResult);
        
        // Log combat result
        const logLevel = battleResult.result === 'win' ? 'info' : 'warn';
        await sendLog(heroId, logLevel, 'combat_end', { 
            result: battleResult.result, 
            monsterName, 
            lootCount: (battleResult.loot || []).length 
        });
        console.log("log sent for log service");

        // send message to inventory service if there is loot
        if (battleResult.result === 'win') {
            // add action to battleResult
            battleResult.action = 'update_inventory';
            const inventoryQueue = 'inventory_queue';
            channel.assertQueue(inventoryQueue, { durable: true });
            channel.sendToQueue(inventoryQueue, Buffer.from(JSON.stringify(battleResult)), { persistent: true });
            console.log("Loot sent to inventory service:", battleResult);
        }

        channel.ack(msg);

    }, { noAck: false });
}

function battleTest()
{
        const combatDataSimulation = {
            "hero": {
            "heroId": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
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
    let gold = 0;

    // extract stats needed for logging
    let monsterName = combatData.monster.name;

    // Loop until one of them is defeated
    while (heroHp > 0 && monsterHp > 0)
    {
        // Hero attacks monster
        const damageToMonster = Math.max(0, heroAtt - monsterDef);
        monsterHp -= damageToMonster;
        console.log(`Round ${round}: you deals ${damageToMonster} damage to ${monsterName}. ${monsterName} HP: ${monsterHp}`);
        // earn two gold per per damage dealt
        gold += damageToMonster * 2;

        if (monsterHp <= 0) break; // Monster defeated

        // Monster attacks hero
        const damageToHero = Math.max(0, monsterAtt - heroDef);
        heroHp -= damageToHero;
        console.log(`Round ${round}: ${monsterName} deals ${damageToHero} damage to you. Your HP: ${heroHp}`);
        // lose one gold per damage taken
        gold -= damageToHero * 1;

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

    let battleJson = {};

    if (heroHp > 0) {
        battleJson.result = "win";
    } else {
        battleJson.result = "lose";
    }

    // Add earned gold to the result
    battleJson.gold = Math.max(0, gold);

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
        battleJson.items = lootGained;
    }
    else 
    {
        battleJson.items = [];
    }
    
    battleJson.heroId = combatData.hero.heroId;
    battleJson.remainingHp = Math.max(0, heroHp);

    return battleJson;
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