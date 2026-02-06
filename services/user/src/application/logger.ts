import amqp, { Channel } from 'amqplib';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672';
const LOG_QUEUE = 'log_queue';

let channel: Channel | null = null;

async function connectLogger(): Promise<void> {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    await channel.assertQueue(LOG_QUEUE, { durable: true });

    console.log('log_queue created:', LOG_QUEUE);
    console.log('Connected to RabbitMQ for logging');

    connection.on('close', () => {
      console.warn('[USER-LOG] RabbitMQ connection closed. Reconnecting...');
      channel = null;
      setTimeout(connectLogger, 5000);
    });

    connection.on('error', (err) => {
      console.error('[USER-LOG] RabbitMQ connection error:', err.message);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[USER-LOG] Failed to connect to RabbitMQ:', message);
    setTimeout(connectLogger, 5000);
  }
}

export async function initLogger(): Promise<void> {
  if (!channel) {
    await connectLogger();
  }
}

export async function sendUserLog(
  userId: string | null,
  level: number,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  if (!channel) {
    console.warn('[USER-LOG] Channel not initialized, skipping log');
    return;
  }

  try {
    const logData = {
      user_id: userId,
      level,
      timestamp: new Date().toISOString(),
      service: 'user',
      eventType,
      payload
    };

    await channel.assertQueue(LOG_QUEUE, { durable: true });
    channel.sendToQueue(LOG_QUEUE, Buffer.from(JSON.stringify(logData)), { persistent: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[USER-LOG] Failed to send log:', message);
  }
}
