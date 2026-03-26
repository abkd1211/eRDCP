import amqplib, { Channel, ChannelModel, Options } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { env } from './env';
import logger from './logger';

export const EXCHANGE    = 'emergency.events';
export const DL_EXCHANGE = 'emergency.dead-letter';

export const ROUTING_KEYS = {
  LOCATION_UPDATED:     'location.updated',
  VEHICLE_UNRESPONSIVE: 'vehicle.unresponsive',
  TRIP_COMPLETED:       'trip.completed',
} as const;

// Queues this service CONSUMES from
export const CONSUME_QUEUES = {
  INCIDENT_CREATED:    'dispatch.incident.created',
  INCIDENT_DISPATCHED: 'dispatch.incident.dispatched',
} as const;

let connection: ChannelModel | null = null;
let channel:    Channel      | null = null;

export const connectRabbitMQ = async (): Promise<void> => {
  try {
    connection = await amqplib.connect(env.RABBITMQ_URL);
    channel    = await connection.createChannel();

    await channel.assertExchange(EXCHANGE,    'topic',  { durable: true });
    await channel.assertExchange(DL_EXCHANGE, 'direct', { durable: true });

    // Assert queues this service consumes
    for (const q of Object.values(CONSUME_QUEUES)) {
      await channel.assertQueue(q, {
        durable:   true,
        arguments: { 'x-dead-letter-exchange': DL_EXCHANGE },
      });
    }

    // Bind queues to exchange
    await channel.bindQueue(CONSUME_QUEUES.INCIDENT_CREATED,    EXCHANGE, 'incident.created');
    await channel.bindQueue(CONSUME_QUEUES.INCIDENT_DISPATCHED, EXCHANGE, 'incident.dispatched');

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
    // Capture channel in local variable — TypeScript can't narrow the outer let
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

export const getChannel = (): Channel | null => channel;

export const disconnectRabbitMQ = async (): Promise<void> => {
  try {
    if (channel)    await channel.close();
    if (connection) await connection.close();
    logger.info('RabbitMQ disconnected');
  } catch (err) {
    logger.error('Error disconnecting RabbitMQ', { error: err });
  }
};
