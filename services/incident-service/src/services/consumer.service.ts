import { ConsumeMessage } from 'amqplib';
import { getChannel, CONSUME_QUEUES } from '../config/rabbitmq';
import incidentService from '../services/incident.service';
import logger from '../config/logger';
import { AiCallProcessedPayload } from '../types';

// ─── Start All Consumers ──────────────────────────────────────────────────────
export const startConsumers = async (): Promise<void> => {
  await consumeAiCallProcessed();
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

        // Acknowledge — message processed successfully
        channel.ack(msg);
      } catch (err) {
        logger.error('Failed to process ai.call.processed event', { error: err });
        // Nack without requeue — send to dead-letter exchange
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  logger.info(`Consumer started on queue: ${CONSUME_QUEUES.AI_CALL_PROCESSED}`);
};
