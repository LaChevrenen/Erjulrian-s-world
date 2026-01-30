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
    const queue = 'log_queue';
    await rabbitChannel.assertQueue(queue, { durable: true });
    console.log('Connected to RabbitMQ');
  } catch (error) {
    console.error('Failed to connect to RabbitMQ:', error);
    setTimeout(connectRabbitMQ, 5000);
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

app.post('/api/inventory', async (req, res) => {
  try {
    const { heroId, gold } = req.body;

    if (!heroId) {
      return res.status(400).json({ error: 'heroId is required' });
    }

    const insertInventory = `
      INSERT INTO inventory_schema.Inventories (hero_id, gold)
      VALUES ($1, $2)
      ON CONFLICT (hero_id) DO NOTHING
      RETURNING hero_id, gold
    `;

    const result = await dbClient.query(insertInventory, [heroId, Number.isInteger(gold) ? gold : 0]);

    if (result.rowCount === 0) {
      return res.status(409).json({ error: 'Inventory already exists' });
    }

    await sendLog(heroId, 1, 'inventory_created', { hero_id: heroId, gold: result.rows[0].gold });

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
