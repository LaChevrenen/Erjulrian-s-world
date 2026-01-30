const amqp = require('amqplib'); // Pour RabbitMQ par exemple

async function start() {
    const connection = await amqp.connect('amqp://rabbitmq');
    const channel = await connection.createChannel();
    
    const queue = 'combat_queue';
    await channel.assertQueue(queue, { durable: true });

    console.log("Service de combat en attente de messages...");

    channel.consume(queue, (msg) => {
        const combatData = JSON.parse(msg.content.toString());
        console.log("Combat reçu :", combatData);

        const battleResult = computeBattle(combatData);
        
        // send message to another queue
        const resultQueue = 'combat_result_queue';
        channel.assertQueue(resultQueue, { durable: true });
        channel.sendToQueue(resultQueue, Buffer.from(JSON.stringify(battleResult)), { persistent: true });

        console.log("Résultat du combat envoyé :", battleResult);

        channel.ack(msg);

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
                "artifactId": 1,
                "chance": 0.5,
                "amount": 1
            },
            {
                "artifactId": 2,
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

    let battleJson = {};

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
    }
    else 
    {
        battleJson.loot = [];
    }

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
        if (typeof loot.artifactId !== 'number' || typeof loot.chance !== 'number' ||
            typeof loot.amount !== 'number') {
            return false;
        }
    }

    return true;
}

start();
// battleTest();