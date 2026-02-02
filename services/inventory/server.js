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
    
    // Assert queues
    const logQueue = await rabbitChannel.assertQueue('log_queue', { durable: true });
    const inventoryQueue = await rabbitChannel.assertQueue('inventory_queue', { durable: true });
    
    console.log('✓ log_queue created:', logQueue.queue);
    console.log('✓ inventory_queue created:', inventoryQueue.queue);
    console.log('Connected to RabbitMQ');
    
    // Start consuming inventory queue
    startInventoryConsumer();
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
          // const { action, heroId } = request;
          
          switch (action) {
            case 'get':
              // GET inventory
              const inventoryResult = await dbClient.query(
                'SELECT gold FROM inventory_schema.Inventories WHERE hero_id = $1',
                [heroId]
              );
              
              if (inventoryResult.rowCount > 0) {
                const itemsResult = await dbClient.query(
                  'SELECT artifact_id AS "artifactId", quantity, equipped FROM inventory_schema.InventoryItems WHERE hero_id = $1',
                  [heroId]
                );
                console.log(`Retrieved inventory for hero ${heroId}`);
              }
              break;
              
            case 'update_inventory':
              // Combined inventory update - handle gold and items in one operation
              // goldDelta can be positive (add) or negative (remove)
              const goldDelta = request.gold || 0;
              const itemsToAdd = request.items || [];
              
              // Update gold if there's a change
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
              
              // Add artifacts
              for (const item of itemsToAdd) {
                const checkResult = await dbClient.query(
                  'SELECT quantity FROM inventory_schema.InventoryItems WHERE hero_id = $1 AND artifact_id = $2',
                  [heroId, item.artifactId]
                );
                
                if (checkResult.rowCount > 0) {
                  await dbClient.query(
                    'UPDATE inventory_schema.InventoryItems SET quantity = quantity + $1 WHERE hero_id = $2 AND artifact_id = $3',
                    [item.quantity || 1, heroId, item.artifactId]
                  );
                } else {
                  await dbClient.query(
                    'INSERT INTO inventory_schema.InventoryItems (hero_id, artifact_id, quantity, equipped) VALUES ($1, $2, $3, false)',
                    [heroId, item.artifactId, item.quantity || 1]
                  );
                }
                
                await sendLog(heroId, 1, 'artifact_added', { hero_id: heroId, artifact_id: item.artifactId, quantity: item.quantity || 1 });
                console.log(`Added artifact ${item.artifactId} (qty: ${item.quantity || 1}) to hero ${heroId}`);
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

async function sendLog(userId, level, eventType, payload) {
  if (!rabbitChannel) return;

  try {
    const logData = {
      user_id: userId,
      level: level,
      timestamp: new Date().toISOString(),
      service: 'inventory',
      eventType: eventType,
      payload: payload
    };

    rabbitChannel.sendToQueue('log_queue', Buffer.from(JSON.stringify(logData)), { persistent: true });
  } catch (error) {
    console.error('Failed to send log:', error);
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
      INSERT INTO inventory_schema.Inventories (hero_id, gold)
      VALUES ($1, $2)
      ON CONFLICT (hero_id) DO UPDATE SET gold = $2
      RETURNING hero_id, gold
    `;

    const result = await dbClient.query(insertInventory, [heroId, Number.isInteger(gold) ? gold : 0]);

    if (result.rowCount === 0) {
      // If conflict occurred, fetch the existing inventory
      const existingResult = await dbClient.query(
        'SELECT hero_id, gold FROM inventory_schema.Inventories WHERE hero_id = $1',
        [heroId]
      );
      return res.status(200).json({ heroId, gold: existingResult.rows[0]?.gold || 0, items: [] });
    }

    await sendLog(heroId, 1, 'inventory_created', { hero_id: heroId, gold: result.rows[0].gold });
    await publishInventoryEvent('inventory_created', { heroId, gold: result.rows[0].gold });

    return res.status(201).json({ heroId, gold: result.rows[0].gold, items: [] });
  } catch (error) {
    console.error('Error creating inventory:', error);
    return res.status(500).json({ error: 'Failed to create inventory' });
  }
});

app.get('/api/inventory/:heroId', async (req, res) => {
  try {
    const { heroId } = req.params;

    const inventoryResult = await dbClient.query(
      'SELECT gold FROM inventory_schema.Inventories WHERE hero_id = $1',
      [heroId]
    );

    if (inventoryResult.rowCount === 0) {
      return res.status(404).json({ error: 'Inventory not found' });
    }

    const itemsResult = await dbClient.query(
      'SELECT artifact_id AS "artifactId", quantity, equipped FROM inventory_schema.InventoryItems WHERE hero_id = $1',
      [heroId]
    );

    return res.status(200).json({
      gold: inventoryResult.rows[0].gold,
      items: itemsResult.rows
    });
  } catch (error) {
    console.error('Error fetching inventory:', error);
    return res.status(500).json({ error: 'Failed to fetch inventory' });
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
        INSERT INTO inventory_schema.InventoryItems (hero_id, artifact_id, quantity, equipped)
        VALUES ($1, $2, $3, $4)
      `;

      for (const item of items) {
        await dbClient.query(insertItemQuery, [
          heroId,
          item.artifactId,
          Number.isInteger(item.quantity) ? item.quantity : 1,
          Boolean(item.equipped)
        ]);
      }
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

app.listen(PORT, () => {
  console.log(`Inventory service running on port ${PORT}`);
});

connectDB();
connectRabbitMQ();
