const amqp = require('amqplib');

let logChannel;

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
        let combatData;
        try {
            combatData = JSON.parse(msg.content.toString());
        } catch (error) {
            console.error("[COMBAT-SERVICE] Erreur de parsing du message de combat:", error);
            channel.ack(msg);
            return;
        }
        const heroId = combatData.hero.heroId;
        const monsterName = combatData.monster.name;
        const runId = combatData.runId;
        
        await sendLog(heroId, 'info', 'combat_start', { monsterName, monsterType: combatData.monster.type });

        let battleResult;
        try {
            battleResult = computeBattle(combatData);
            battleResult.runId = runId;
        } catch (error) {
            console.error("Unable to process combat data:", error);
            await sendLog(heroId, 'error', 'combat_error', { error: error.message });
            channel.ack(msg);
            return;
        }

        const resultQueue = 'combat_result_queue';
        channel.assertQueue(resultQueue, { durable: true });
        channel.sendToQueue(resultQueue, Buffer.from(JSON.stringify(battleResult)), { persistent: true });
        
        const logLevel = battleResult.result === 'win' ? 'info' : 'warn';
        await sendLog(heroId, logLevel, 'combat_end', { 
            result: battleResult.result, 
            monsterName, 
            lootCount: (battleResult.loot || []).length 
        });

        if (battleResult.result === 'win') {
            battleResult.action = 'update_inventory';
            const inventoryQueue = 'inventory_queue';
            channel.assertQueue(inventoryQueue, { durable: true });
            channel.sendToQueue(inventoryQueue, Buffer.from(JSON.stringify(battleResult)), { persistent: true });
        }

        const heroUpdate = {
            type: 'hero_stats_updated',
            heroId: battleResult.heroId,
            currentHp: battleResult.currentHp,
            maxHp: combatData.hero.stats.hp,
            xpGained: battleResult.xpDelta
        };
        const heroQueue = 'hero_queue';
        channel.assertQueue(heroQueue, { durable: true });
        channel.sendToQueue(heroQueue, Buffer.from(JSON.stringify(heroUpdate)), { persistent: true });

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
                "current_hp": 20,
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

        const battleResult = computeBattle(combatDataSimulation);

        combatDataSimulation.monster.stats.att = 10;
        const battleResultLose = computeBattle(combatDataSimulation);
}

function computeBattle(combatData) 
{
    if (!assertDataStructure(combatData))
    {
        throw new Error("Invalid combat data structure");
    }

    const heroStats = combatData.hero.stats;
    const monsterStats = combatData.monster.stats;

    let heroHp = heroStats.current_hp;
    let heroMaxHp = heroStats.hp;
    let heroAtt = heroStats.att;
    let heroDef = heroStats.def;
    let heroRegen = heroStats.regen;
    
    let monsterHp = monsterStats.hp;
    let monsterMaxHp = monsterStats.hp;
    let monsterAtt = monsterStats.att;
    let monsterDef = monsterStats.def;
    let monsterRegen = monsterStats.regen;

    let round = 0;
    let gold = 0;
    let xp = 0;

    let monsterName = combatData.monster.name;

    while (heroHp > 0 && monsterHp > 0)
    {
        const damageToMonster = Math.max(0, heroAtt - monsterDef);
        monsterHp -= damageToMonster;
        console.log(`Round ${round}: you deals ${damageToMonster} damage to ${monsterName}. ${monsterName} HP: ${monsterHp}`);
        gold += damageToMonster * 2;
        xp += damageToMonster * 1;

        if (monsterHp <= 0) break;

        const damageToHero = Math.max(0, monsterAtt - heroDef);
        heroHp -= damageToHero;
        gold -= damageToHero * 1;

        if (heroHp <= 0) break;

        heroHp += heroRegen;
        monsterHp += monsterRegen;
        heroHp = Math.min(heroHp, heroMaxHp);
        monsterHp = Math.min(monsterHp, monsterMaxHp);
        
        round++;
        if (round % 10 === 0) {
        }
    }

    let battleJson = {};

    if (heroHp > 0) {
        battleJson.result = "win";
    } else {
        battleJson.result = "lose";
    }

    battleJson.gold = Math.max(0, gold);
    battleJson.xpDelta = xp;

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
    battleJson.currentHp = Math.max(0, heroHp);

    return battleJson;
}

function assertDataStructure(data)
{
    if (!data.hero || !data.monster) {
        return false;
    }

    const hero = data.hero;
    if (typeof hero.heroId !== 'string' || typeof hero.level !== 'number' || typeof hero.xp !== 'number') {
        return false;
    }

    const heroStats = hero.stats;
    if (typeof heroStats.hp !== 'number' || typeof heroStats.att !== 'number' ||
        typeof heroStats.def !== 'number' || typeof heroStats.regen !== 'number') {
        return false;
    }

    const monster = data.monster;
    if (typeof monster.id !== 'string' || typeof monster.name !== 'string' ||
        typeof monster.type !== 'string' || typeof monster.description !== 'string') {
        return false;
    }

    const monsterStats = monster.stats;
    if (typeof monsterStats.hp !== 'number' || typeof monsterStats.att !== 'number' ||
        typeof monsterStats.def !== 'number' || typeof monsterStats.regen !== 'number') {
        return false;
    }

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