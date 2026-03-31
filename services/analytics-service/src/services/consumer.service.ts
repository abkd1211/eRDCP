import { ConsumeMessage } from 'amqplib';
import { getChannel, CONSUME_QUEUES } from '../config/rabbitmq';
import analyticsService from '../services/analytics.service';
import logger from '../config/logger';

export const startConsumers = async (): Promise<void> => {
  const channel = getChannel();
  if (!channel) {
    logger.error('Cannot start consumers — RabbitMQ channel not ready');
    return;
  }

  const consumers: [string, (payload: unknown) => Promise<void>][] = [
    [CONSUME_QUEUES.INCIDENT_CREATED,     (p) => analyticsService.handleIncidentCreated(p as never)],
    [CONSUME_QUEUES.INCIDENT_DISPATCHED,  (p) => analyticsService.handleIncidentDispatched(p as never)],
    [CONSUME_QUEUES.INCIDENT_RESOLVED,    (p) => analyticsService.handleIncidentResolved(p as never)],
    [CONSUME_QUEUES.TRIP_COMPLETED,       (p) => analyticsService.handleTripCompleted(p as never)],
    [CONSUME_QUEUES.VEHICLE_UNRESPONSIVE, (p) => analyticsService.handleVehicleUnresponsive(p as never)],
    [CONSUME_QUEUES.HOSPITAL_CAPACITY_UPDATED, (p) => analyticsService.handleHospitalCapacityUpdated(p as never)],
  ];

  for (const [queue, handler] of consumers) {
    await channel.consume(
      queue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return;
        try {
          const event   = JSON.parse(msg.content.toString());
          const payload = event.payload;
          logger.debug(`Processing ${event.event_type}`, { eventId: event.event_id });
          await handler(payload);
          channel.ack(msg);
        } catch (err) {
          logger.error(`Failed to process message from ${queue}`, { error: err });
          channel.nack(msg, false, false);
        }
      },
      { noAck: false }
    );
    logger.info(`Consumer started: ${queue}`);
  }

  // Location updated handled separately — high volume, just log for now
  await channel.consume(
    CONSUME_QUEUES.LOCATION_UPDATED,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      // Acknowledge immediately — we don't write per-ping analytics
      // The trip.completed event handles aggregated location stats
      channel.ack(msg);
    },
    { noAck: false }
  );

  logger.info('All RabbitMQ consumers started');
};
