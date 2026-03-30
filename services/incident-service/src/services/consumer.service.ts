import { ConsumeMessage } from 'amqplib';
import { getChannel, CONSUME_QUEUES } from '../config/rabbitmq';
import incidentService from '../services/incident.service';
import logger from '../config/logger';
import { AiCallProcessedPayload } from '../types';

// ─── Start All Consumers ──────────────────────────────────────────────────────
export const startConsumers = async (): Promise<void> => {
  await consumeAiCallProcessed();
  await consumeIncidentStatusUpdate();
  logger.info('RabbitMQ consumers started');
};

// ─── Consume: ai.call.processed ──────────────────────────────────────────────
const consumeAiCallProcessed = async (): Promise<void> => {
  const channel = getChannel();
  if (!channel) {
    logger.error('Cannot start consumer — RabbitMQ channel not available');
    return;
  }

  await channel.consume(
    CONSUME_QUEUES.AI_CALL_PROCESSED,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;

      try {
        const raw     = msg.content.toString();
        const event   = JSON.parse(raw);
        const payload = event.payload as AiCallProcessedPayload;

        logger.info('Received ai.call.processed event', {
          eventId:   event.event_id,
          sessionId: payload.session_id,
        });

        await incidentService.handleAiCallProcessed(payload);

        channel.ack(msg);
      } catch (err) {
        logger.error('Failed to process ai.call.processed event', { error: err });
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  logger.info(`Consumer started on queue: ${CONSUME_QUEUES.AI_CALL_PROCESSED}`);
};

// ─── Consume: incident.status.update ─────────────────────────────────────────
// Fired by the dispatch simulation service when the vehicle arrives on scene.
// Updates the incident status in PostgreSQL so the frontend reflects real time.
const consumeIncidentStatusUpdate = async (): Promise<void> => {
  const channel = getChannel();
  if (!channel) return;

  await channel.consume(
    CONSUME_QUEUES.INCIDENT_STATUS_UPDATE,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      try {
        const event   = JSON.parse(msg.content.toString());
        const payload = event.payload;

        logger.info('Received incident.status.update event', {
          incidentId: payload.incident_id,
          newStatus:  payload.new_status,
        });

        await incidentService.updateIncidentStatus(
          payload.incident_id,
          { status: payload.new_status, note: payload.note },
          payload.updated_by || 'system'
        );

        channel.ack(msg);
      } catch (err) {
        // Nack without requeue — bad message or already in terminal state
        logger.error('Failed to process incident.status.update', { error: err });
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  logger.info(`Consumer started on queue: ${CONSUME_QUEUES.INCIDENT_STATUS_UPDATE}`);
};
