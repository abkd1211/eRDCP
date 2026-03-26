import amqplib, { Channel, ChannelModel, Options } from 'amqplib';
import { v4 as uuidv4 } from 'uuid';
import { env } from './env';
import logger from './logger';

export const EXCHANGE    = 'emergency.events';
export const DL_EXCHANGE = 'emergency.dead-letter';

// Queues this service CONSUMES from
export const CONSUME_QUEUES = {
  INCIDENT_CREATED:    'analytics.incident.created',
  INCIDENT_DISPATCHED: 'analytics.incident.dispatched',
  INCIDENT_RESOLVED:   'analytics.incident.resolved',
  LOCATION_UPDATED:    'analytics.location.updated',
  TRIP_COMPLETED:      'analytics.trip.completed',
  VEHICLE_UNRESPONSIVE:'analytics.vehicle.unresponsive',
} as const;

let connection: ChannelModel | null = null;
let channel:    Channel      | null = null;

export const connectRabbitMQ = async (): Promise<void> => {
  try {
    connection = await amqplib.connect(env.RABBITMQ_URL);
    channel    = await connection.createChannel();

    await channel.assertExchange(EXCHANGE,    'topic',  { durable: true });
    await channel.assertExchange(DL_EXCHANGE, 'direct', { durable: true });

    // Assert and bind all queues
    const bindings: [string, string][] = [
      [CONSUME_QUEUES.INCIDENT_CREATED,     'incident.created'],
      [CONSUME_QUEUES.INCIDENT_DISPATCHED,  'incident.dispatched'],
      [CONSUME_QUEUES.INCIDENT_RESOLVED,    'incident.resolved'],
      [CONSUME_QUEUES.LOCATION_UPDATED,     'location.updated'],
      [CONSUME_QUEUES.TRIP_COMPLETED,       'trip.completed'],
      [CONSUME_QUEUES.VEHICLE_UNRESPONSIVE, 'vehicle.unresponsive'],
    ];

    for (const [queue, routingKey] of bindings) {
      await channel.assertQueue(queue, {
        durable:   true,
        arguments: { 'x-dead-letter-exchange': DL_EXCHANGE },
      });
      await channel.bindQueue(queue, EXCHANGE, routingKey);
    }

    channel.prefetch(5); // Analytics can handle more concurrent messages

    connection.on('error', (err: Error) => {
      logger.error('RabbitMQ error', { error: err.message });
      reconnect();
    });
    connection.on('close', () => {
      logger.warn('RabbitMQ closed — reconnecting');
      reconnect();
    });

    logger.info('RabbitMQ connected — analytics listening on all queues');
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
