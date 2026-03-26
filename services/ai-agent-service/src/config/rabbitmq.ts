import amqplib, { Channel, ChannelModel, Options } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { env } from './env';
import logger from './logger';

export const EXCHANGE    = 'emergency.events';
export const DL_EXCHANGE = 'emergency.dead-letter';

export const ROUTING_KEYS = {
  AI_CALL_PROCESSED: 'ai.call.processed',
} as const;

let connection: ChannelModel | null = null;
let channel:    Channel      | null = null;

export const connectRabbitMQ = async (): Promise<void> => {
  try {
    connection = await amqplib.connect(env.RABBITMQ_URL);
    channel    = await connection.createChannel();

    await channel.assertExchange(EXCHANGE,    'topic',  { durable: true });
    await channel.assertExchange(DL_EXCHANGE, 'direct', { durable: true });

    channel.prefetch(1);

    connection.on('error', (err: Error) => {
      logger.error('RabbitMQ error', { error: err.message });
      reconnect();
    });
    connection.on('close', () => {
      logger.warn('RabbitMQ closed — reconnecting');
      reconnect();
    });

    logger.info('RabbitMQ connected');
  } catch (err) {
    logger.error('RabbitMQ connection failed', { error: err });
    setTimeout(connectRabbitMQ, 5000);
  }
};

const reconnect = (): void => {
  connection = null;
  channel    = null;
  setTimeout(connectRabbitMQ, 5000);
};

export const publishEvent = async <T extends object>(
  routingKey: string,
  payload: T,
  options: Options.Publish = {}
): Promise<boolean> => {
  if (!channel) {
    logger.error('RabbitMQ channel not ready', { routingKey });
    return false;
  }

  const message = {
    event_id:   uuidv4(),
    event_type: routingKey,
    source:     env.SERVICE_NAME,
    timestamp:  new Date().toISOString(),
    version:    '1.0',
    payload,
  };

  try {
    const ch = channel;
    return ch.publish(
      EXCHANGE, routingKey,
      Buffer.from(JSON.stringify(message)),
      { persistent: true, contentType: 'application/json', messageId: message.event_id, ...options }
    );
  } catch (err) {
    logger.error('Publish failed', { routingKey, error: err });
    return false;
  }
};

export const disconnectRabbitMQ = async (): Promise<void> => {
  try {
    if (channel)    await channel.close();
    if (connection) await connection.close();
    logger.info('RabbitMQ disconnected');
  } catch (err) {
    logger.error('Error disconnecting RabbitMQ', { error: err });
  }
};
