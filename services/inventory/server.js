const express = require('express');
const { Client } = require('pg');
const amqp = require('amqplib');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3004;

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'inventory_user',
  password: process.env.DB_PASSWORD || 'inventory_password',
  database: process.env.DB_NAME || 'erjulrian_db'
};

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';

const swaggerDocument = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

let dbClient;
let rabbitChannel;

async function connectDB() {
  try {
    dbClient = new Client(dbConfig);
    await dbClient.connect();
    console.log('Connected to PostgreSQL database');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    setTimeout(connectDB, 5000);
  }
}

async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    rabbitChannel = await connection.createChannel();
    
    const logQueue = await rabbitChannel.assertQueue('log_queue', { durable: true });
    const inventoryQueue = await rabbitChannel.assertQueue('inventory_queue', { durable: true });
    
    console.log('log_queue created:', logQueue.queue);
    console.log('inventory_queue created:', inventoryQueue.queue);
    console.log('Connected to RabbitMQ');
    
    startInventoryConsumer();
    startInventoryRPCListener();
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
    setTimeout(connectRabbitMQ, 5000);
  }
}

async function startInventoryConsumer() {
  if (!rabbitChannel) {
    console.error('Cannot start inventory consumer: rabbitChannel is null');
    return;
  }
  
  try {
    console.log('Starting inventory queue consumer...');
    rabbitChannel.consume('inventory_queue', async (msg) => {
      if (msg !== null) {
        const request = JSON.parse(msg.content.toString());
        console.log('Inventory request received:', request);
        
        try {
          const heroId = request.heroId;
          const action = request.action;
          
          switch (action) {
            case 'get':
              const inventoryResult = await dbClient.query(
                'SELECT gold, equipped_count FROM inventory_schema.Inventories WHERE hero_id = $1',
                [heroId]
              );
              
              if (inventoryResult.rowCount > 0) {
                const itemsResult = await dbClient.query(
                  'SELECT id, artifact_id AS "artifactId", equipped, upgrade_level AS "upgradeLevel" FROM inventory_schema.InventoryItems WHERE hero_id = $1',
                  [heroId]
                );
                console.log(`Retrieved inventory for hero ${heroId}`);
              }
              break;
            case 'add_gold':
              await dbClient.query(
                'UPDATE inventory_schema.Inventories SET gold = gold + $1 WHERE hero_id = $2',
                [request.gold || 0, heroId]
              );
              await sendLog(heroId, 1, 'gold_added', { hero_id: heroId, gold_added: request.gold || 0 });
              console.log(`Added ${request.gold || 0} gold to hero ${heroId}`);
              break;
            case 'remove_gold':
              await dbClient.query(
                'UPDATE inventory_schema.Inventories SET gold = GREATEST(gold - $1, 0) WHERE hero_id = $2',
                [request.gold || 0, heroId]
              );
              await sendLog(heroId, 1, 'gold_removed', { hero_id: heroId, gold_removed: request.gold || 0 });
              console.log(`Removed ${request.gold || 0} gold from hero ${heroId}`);
              break;
            case 'add_item': {
              const item = request.artifact;
              if (!item?.artifactId) {
                console.warn('add_item called without artifactId');
                break;
              }
              await dbClient.query(
                'INSERT INTO inventory_schema.InventoryItems (hero_id, artifact_id, equipped, upgrade_level) VALUES ($1, $2, false, $3)',
                [heroId, item.artifactId, item.upgradeLevel || 0]
              );

              await sendLog(heroId, 1, 'artifact_added', { hero_id: heroId, artifact_id: item.artifactId });
              console.log(`Added artifact ${item.artifactId} to hero ${heroId}`);
              break;
            }
            case 'remove_item': {
              const item = request.artifact;
              if (!item?.id) {
                console.warn('remove_item called without id');
                break;
              }
              await dbClient.query(
                'DELETE FROM inventory_schema.InventoryItems WHERE id = $1',
                [item.id]
              );
              await sendLog(heroId, 1, 'item_removed', { hero_id: heroId, item_id: item.id });
              console.log(`Removed item ${item.id} from hero ${heroId}`);
              break;
            }
              
            case 'update_inventory':
              const goldDelta = request.gold || 0;
              const itemsToAdd = request.items || [];
              
              if (goldDelta !== 0) {
                if (goldDelta > 0) {
                  await dbClient.query(
                    'UPDATE inventory_schema.Inventories SET gold = gold + $1 WHERE hero_id = $2',
                    [goldDelta, heroId]
                  );
                  await sendLog(heroId, 1, 'gold_added', { hero_id: heroId, gold_added: goldDelta });
                  console.log(`Added ${goldDelta} gold to hero ${heroId}`);
                } else {
                  await dbClient.query(
                    'UPDATE inventory_schema.Inventories SET gold = GREATEST(gold + $1, 0) WHERE hero_id = $2',
                    [goldDelta, heroId]
                  );
                  await sendLog(heroId, 1, 'gold_removed', { hero_id: heroId, gold_removed: Math.abs(goldDelta) });
                  console.log(`Removed ${Math.abs(goldDelta)} gold from hero ${heroId}`);
                }
              }
              
              for (const item of itemsToAdd) {
                await dbClient.query(
                  'INSERT INTO inventory_schema.InventoryItems (hero_id, artifact_id, equipped, upgrade_level) VALUES ($1, $2, false, $3)',
                  [heroId, item.artifactId, item.upgradeLevel || 0]
                );
                
                await sendLog(heroId, 1, 'artifact_added', { hero_id: heroId, artifact_id: item.artifactId });
                console.log(`Added artifact ${item.artifactId} to hero ${heroId}`);
              }
              break;
              
            default:
              console.warn(`Unknown action: ${action}`);
          }
        } catch (error) {
          console.error('Error processing inventory request:', error);
        }
        
        rabbitChannel.ack(msg);
      }
    });
    
    console.log('Inventory queue consumer started');
  } catch (error) {
    console.error('Failed to start inventory consumer:', error);
  }
}

async function startInventoryRPCListener() {
  if (!rabbitChannel) {
    console.error('Cannot start inventory RPC listener: rabbitChannel is null');
    return;
  }
  
  try {
    await rabbitChannel.assertQueue('inventory_rpc_queue', { durable: true });
    
    rabbitChannel.consume('inventory_rpc_queue', async (msg) => {
      if (msg !== null) {
        try {
          const request = JSON.parse(msg.content.toString());
          const { type, heroId } = request;
          const correlationId = msg.properties.correlationId;
          const replyTo = msg.properties.replyTo;
          
          let response;
          
          if (type === 'get_equipped_artifacts') {
            const result = await dbClient.query(
              `SELECT ii.id, ii.artifact_id AS "artifactId", ii.upgrade_level AS "upgradeLevel", a.hp_buff, a.att_buff, a.def_buff, a.regen_buff
               FROM inventory_schema.InventoryItems ii
               JOIN inventory_schema.Artifacts a ON ii.artifact_id = a.id
               WHERE ii.hero_id = $1 AND ii.equipped = true`,
              [heroId]
            );
            
            response = {
              success: true,
              items: result.rows
            };
          } else {
            response = { success: false, error: 'Unknown RPC type' };
          }
          
          if (replyTo) {
            rabbitChannel.sendToQueue(replyTo, Buffer.from(JSON.stringify(response)), {
              correlationId: correlationId
            });
          }
          
          rabbitChannel.ack(msg);
        } catch (error) {
          console.error('Error processing inventory RPC request:', error);
          rabbitChannel.ack(msg);
        }
      }
    });
    
    console.log('Inventory RPC listener started');
  } catch (error) {
    console.error('Error starting inventory RPC listener:', error);
  }
}

async function sendLog(userId, level, eventType, payload) {
  if (!rabbitChannel) {
    console.warn('[SENDLOG] Channel not initialized, skipping log');
    return;
  }

  try {
    const logData = {
      user_id: userId,
      level: level,
      timestamp: new Date().toISOString(),
      service: 'inventory',
      eventType: eventType,
      payload: payload
    };

    await rabbitChannel.assertQueue('log_queue', { durable: true });
    rabbitChannel.sendToQueue('log_queue', Buffer.from(JSON.stringify(logData)), { persistent: true });
    console.log(`[SENDLOG] Log sent: ${eventType}`);
  } catch (error) {
    console.error('[SENDLOG] Error:', error);
  }
}

async function publishInventoryEvent(eventType, data) {
  if (!rabbitChannel) return;

  try {
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      ...data
    };

    rabbitChannel.sendToQueue('inventory_queue', Buffer.from(JSON.stringify(event)), { persistent: true });
  } catch (error) {
    console.error('Failed to publish inventory event:', error);
  }
}

app.post('/api/inventory', async (req, res) => {
  try {
    const { heroId, gold } = req.body;

    if (!heroId) {
      return res.status(400).json({ error: 'heroId is required' });
    }

    const insertInventory = `
      INSERT INTO inventory_schema.Inventories (hero_id, gold, equipped_count)
      VALUES ($1, $2, $3)
      ON CONFLICT (hero_id) DO UPDATE SET gold = $2
      RETURNING hero_id, gold, equipped_count
    `;

    const result = await dbClient.query(insertInventory, [heroId, Number.isInteger(gold) ? gold : 0, 0]);

    if (result.rowCount === 0) {
      const existingResult = await dbClient.query(
        'SELECT hero_id, gold, equipped_count FROM inventory_schema.Inventories WHERE hero_id = $1',
        [heroId]
      );
      return res.status(200).json({
        heroId,
        gold: existingResult.rows[0]?.gold || 0,
        equippedCount: existingResult.rows[0]?.equipped_count || 0,
        items: []
      });
    }

    await sendLog(heroId, 1, 'inventory_created', { hero_id: heroId, gold: result.rows[0].gold, equipped_count: result.rows[0].equipped_count });
    await publishInventoryEvent('inventory_created', { heroId, gold: result.rows[0].gold, equippedCount: result.rows[0].equipped_count });

    return res.status(201).json({ heroId, gold: result.rows[0].gold, equippedCount: result.rows[0].equipped_count, items: [] });
  } catch (error) {
    console.error('Error creating inventory:', error);
    return res.status(500).json({ error: 'Failed to create inventory' });
  }
});

app.get('/api/inventory/:heroId', async (req, res) => {
  try {
    const { heroId } = req.params;

    const inventoryResult = await dbClient.query(
      'SELECT gold, equipped_count FROM inventory_schema.Inventories WHERE hero_id = $1',
      [heroId]
    );

    if (inventoryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const itemsResult = await dbClient.query(
      `SELECT 
        ii.id, 
        ii.artifact_id AS "artifactId", 
        ii.equipped, 
        ii.upgrade_level AS "upgradeLevel",
        a.level AS "baseLevel",
        a.name,
        COALESCE(a.hp_buff, 0) * (ii.upgrade_level + 1) AS "hp_buff",
        COALESCE(a.att_buff, 0) * (ii.upgrade_level + 1) AS "att_buff",
        COALESCE(a.def_buff, 0) * (ii.upgrade_level + 1) AS "def_buff",
        COALESCE(a.regen_buff, 0) * (ii.upgrade_level + 1) AS "regen_buff"
       FROM inventory_schema.InventoryItems ii
       LEFT JOIN inventory_schema.Artifacts a ON ii.artifact_id = a.id
       WHERE ii.hero_id = $1`,
      [heroId]
    );

    return res.status(200).json({
      gold: inventoryResult.rows[0].gold,
      equippedCount: inventoryResult.rows[0].equipped_count,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

app.patch('/api/inventory/:itemId/equip', async (req, res) => {
  try {
    const { itemId } = req.params;
    const { equipped } = req.body;

    const itemResult = await dbClient.query(
      'SELECT id, hero_id AS "heroId", equipped FROM inventory_schema.InventoryItems WHERE id = $1',
      [itemId]
    );

    if (itemResult.rowCount === 0) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const heroId = itemResult.rows[0].heroId;
    const nextEquipped = typeof equipped === 'boolean' ? equipped : !itemResult.rows[0].equipped;

    await dbClient.query('BEGIN');

    await dbClient.query(
      'UPDATE inventory_schema.InventoryItems SET equipped = $1 WHERE id = $2',
      [nextEquipped, itemId]
    );

    const equippedCountResult = await dbClient.query(
      'SELECT COUNT(*)::int AS count FROM inventory_schema.InventoryItems WHERE hero_id = $1 AND equipped = true',
      [heroId]
    );

    await dbClient.query(
      'UPDATE inventory_schema.Inventories SET equipped_count = $1 WHERE hero_id = $2',
      [equippedCountResult.rows[0].count, heroId]
    );

    const updatedItemResult = await dbClient.query(
      `SELECT 
        ii.id, 
        ii.artifact_id AS "artifactId", 
        ii.equipped, 
        ii.upgrade_level AS "upgradeLevel",
        a.level AS "baseLevel",
        a.name,
        COALESCE(a.hp_buff, 0) * (ii.upgrade_level + 1) AS "hp_buff",
        COALESCE(a.att_buff, 0) * (ii.upgrade_level + 1) AS "att_buff",
        COALESCE(a.def_buff, 0) * (ii.upgrade_level + 1) AS "def_buff",
        COALESCE(a.regen_buff, 0) * (ii.upgrade_level + 1) AS "regen_buff"
       FROM inventory_schema.InventoryItems ii
       LEFT JOIN inventory_schema.Artifacts a ON ii.artifact_id = a.id
       WHERE ii.id = $1`,
      [itemId]
    );

    await dbClient.query('COMMIT');

    const artifactName = updatedItemResult.rows[0].name || `Artifact ${itemId.substring(0, 8)}`;
    const eventType = nextEquipped ? 'artifact_equipped' : 'artifact_unequipped';
    await sendLog(heroId, 1, eventType, { 
      hero_id: heroId, 
      item_id: itemId,
      artifact_name: artifactName,
      equipped: nextEquipped
    });

    return res.status(200).json(updatedItemResult.rows[0]);
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('Error updating item equip state:', error);
    return res.status(500).json({ error: 'Failed to update item equip state' });
  }
});

app.put('/api/inventory/:heroId', async (req, res) => {
  try {
    const { heroId } = req.params;
    const { gold, items } = req.body;

    const inventoryResult = await dbClient.query(
      'SELECT hero_id FROM inventory_schema.Inventories WHERE hero_id = $1',
      [heroId]
    );

    if (inventoryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    if (Number.isInteger(gold)) {
      await dbClient.query(
        'UPDATE inventory_schema.Inventories SET gold = $1 WHERE hero_id = $2',
        [gold, heroId]
      );
    }

    if (Array.isArray(items)) {
      await dbClient.query('DELETE FROM inventory_schema.InventoryItems WHERE hero_id = $1', [heroId]);

      const insertItemQuery = `
        INSERT INTO inventory_schema.InventoryItems (hero_id, artifact_id, equipped, upgrade_level)
        VALUES ($1, $2, $3, $4)
      `;

      let equippedCount = 0;

      for (const item of items) {
        const isEquipped = Boolean(item.equipped);
        if (isEquipped) {
          equippedCount += 1;
        }
        await dbClient.query(insertItemQuery, [
          heroId,
          item.artifactId,
          isEquipped,
          item.upgradeLevel || 0
        ]);
      }

      await dbClient.query(
        'UPDATE inventory_schema.Inventories SET equipped_count = $1 WHERE hero_id = $2',
        [equippedCount, heroId]
      );
    }

    await publishInventoryEvent('inventory_updated', { heroId });
    await sendLog(heroId, 1, 'inventory_updated', { hero_id: heroId });

    return res.status(200).json({ message: 'Inventory updated' });
  } catch (error) {
    console.error('Error updating inventory:', error);
    return res.status(500).json({ error: 'Failed to update inventory' });
  }
});

app.delete('/api/inventory/:heroId', async (req, res) => {
  try {
    const { heroId } = req.params;

    await dbClient.query('DELETE FROM inventory_schema.InventoryItems WHERE hero_id = $1', [heroId]);
    const result = await dbClient.query('DELETE FROM inventory_schema.Inventories WHERE hero_id = $1', [heroId]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }
    await publishInventoryEvent('inventory_deleted', { heroId });

    await sendLog(heroId, 1, 'inventory_deleted', { hero_id: heroId });

    return res.status(204).send();
  } catch (error) {
    console.error('Error deleting inventory:', error);
    return res.status(500).json({ error: 'Failed to delete inventory' });
  }
});

app.get('/api/inventory/:heroId/equipped_artifacts', async (req, res) => {
  try {
    const { heroId } = req.params;

    const inventoryResult = await dbClient.query(
      'SELECT equipped_count FROM inventory_schema.Inventories WHERE hero_id = $1',
      [heroId]
    );

    if (inventoryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const itemsResult = await dbClient.query(
      `SELECT 
        ii.id,
        ii.artifact_id AS "artifactId",
        ii.equipped,
        ii.upgrade_level AS "upgradeLevel",
        a.level AS "baseLevel",
        a.name,
        COALESCE(a.hp_buff, 0) * (ii.upgrade_level + 1) AS "hp_buff",
        COALESCE(a.att_buff, 0) * (ii.upgrade_level + 1) AS "att_buff",
        COALESCE(a.def_buff, 0) * (ii.upgrade_level + 1) AS "def_buff",
        COALESCE(a.regen_buff, 0) * (ii.upgrade_level + 1) AS "regen_buff"
       FROM inventory_schema.InventoryItems ii
       LEFT JOIN inventory_schema.Artifacts a ON ii.artifact_id = a.id
       WHERE ii.hero_id = $1 AND ii.equipped = true`,
      [heroId]
    );

    return res.status(200).json({
      equippedCount: inventoryResult.rows[0].equipped_count,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

app.get('/api/inventory/:heroId/upgrade-info/:artifactId', async (req, res) => {
  try {
    const { heroId, artifactId } = req.params;
    console.log(`[UPGRADE-INFO] Route called with heroId=${heroId}, artifactId=${artifactId}`);

    const inventoryResult = await dbClient.query(
      'SELECT gold FROM inventory_schema.Inventories WHERE hero_id = $1',
      [heroId]
    );
    console.log(`[UPGRADE-INFO] Inventory query result:`, inventoryResult.rows);

    if (inventoryResult.rows.length === 0) {
      console.error(`[UPGRADE-INFO] Inventory not found for heroId=${heroId}, artifactId=${artifactId}`);
      return res.status(404).json({ error: 'Inventory not found', heroId, artifactId });
    }
    const currentGold = inventoryResult.rows[0].gold;

    const itemResult = await dbClient.query(
      `SELECT ii.upgrade_level, a.level as base_level, a.name
       FROM inventory_schema.InventoryItems ii
       JOIN inventory_schema.Artifacts a ON ii.artifact_id = a.id
       WHERE ii.hero_id = $1 AND ii.artifact_id = $2`,
      [heroId, artifactId]
    );
    console.log(`[UPGRADE-INFO] Item query result:`, itemResult.rows);

    if (itemResult.rows.length === 0) {
      console.error(`[UPGRADE-INFO] Artifact not found for heroId=${heroId}, artifactId=${artifactId}`);
      return res.status(404).json({ error: 'Artifact not found in inventory', heroId, artifactId });
    }

    const { upgrade_level, base_level, name } = itemResult.rows[0];
    const nextLevel = upgrade_level + 1;
    const maxLevel = 10;

    const nextUpgradeCost = 25 * (upgrade_level + 1);
    const canUpgrade = upgrade_level < maxLevel && currentGold >= nextUpgradeCost;

    return res.status(200).json({
      artifactId,
      name,
      currentLevel: upgrade_level,
      nextLevel,
      maxLevel,
      baseLevel: base_level,
      nextUpgradeCost,
      currentGold,
      canUpgrade,
      reason: !canUpgrade ? (upgrade_level >= maxLevel ? 'Max level reached' : 'Insufficient gold') : null
    });

  } catch (error) {
    console.error('Error getting upgrade info:', error);
    return res.status(500).json({ error: 'Failed to get upgrade info' });
  }
});

app.post('/api/inventory/:heroId/upgrade/:artifactId', async (req, res) => {
  try {
    const { heroId, artifactId } = req.params;

    const inventoryResult = await dbClient.query(
      'SELECT gold FROM inventory_schema.Inventories WHERE hero_id = $1',
      [heroId]
    );

    if (inventoryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const currentGold = inventoryResult.rows[0].gold;

    const itemResult = await dbClient.query(
      `SELECT ii.upgrade_level, a.level as base_level, a.name
       FROM inventory_schema.InventoryItems ii
       JOIN inventory_schema.Artifacts a ON ii.artifact_id = a.id
       WHERE ii.hero_id = $1 AND ii.artifact_id = $2`,
      [heroId, artifactId]
    );

    if (itemResult.rows.length === 0) {
      return res.status(404).json({ error: 'Artifact not found in inventory' });
    }

    const { upgrade_level, base_level, name } = itemResult.rows[0];
    const nextLevel = upgrade_level + 1;

    const upgradeCost = 25 * (upgrade_level + 1);

    if (currentGold < upgradeCost) {
      return res.status(400).json({ 
        error: 'Insufficient gold',
        required: upgradeCost,
        current: currentGold
      });
    }

    if (upgrade_level >= 10) {
      return res.status(400).json({ error: 'Artifact is already at maximum upgrade level' });
    }

    await dbClient.query('BEGIN');

    await dbClient.query(
      'UPDATE inventory_schema.Inventories SET gold = gold - $1 WHERE hero_id = $2',
      [upgradeCost, heroId]
    );

    await dbClient.query(
      'UPDATE inventory_schema.InventoryItems SET upgrade_level = upgrade_level + 1 WHERE hero_id = $1 AND artifact_id = $2',
      [heroId, artifactId]
    );

    await dbClient.query('COMMIT');

    await publishInventoryEvent('artifact_upgraded', { heroId, artifactId, newLevel: nextLevel });
    await sendLog(heroId, 1, 'artifact_upgraded', { 
      hero_id: heroId, 
      artifact_id: artifactId,
      artifact_name: name,
      upgrade_level: nextLevel,
      cost: upgradeCost
    });

    return res.status(200).json({ 
      message: 'Artifact upgraded successfully',
      artifact: name,
      newUpgradeLevel: nextLevel,
      costPaid: upgradeCost,
      remainingGold: currentGold - upgradeCost
    });

  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('Error upgrading artifact:', error);
    return res.status(500).json({ error: 'Failed to upgrade artifact' });
  }
});

app.listen(PORT, () => {
  console.log(`Inventory service running on port ${PORT}`);
});

connectDB();
connectRabbitMQ();