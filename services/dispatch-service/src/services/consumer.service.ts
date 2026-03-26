import { ConsumeMessage } from 'amqplib';
import { getChannel, CONSUME_QUEUES, EXCHANGE } from '../config/rabbitmq';
import dispatchService from '../services/dispatch.service';
import logger from '../config/logger';
import { IncidentDispatchedPayload, RegisterVehicleDto } from '../types';
import { Vehicle } from '../models/vehicle.model';

// Add responder.created queue to config at runtime
const RESPONDER_CREATED_QUEUE = 'dispatch.responder.created';

export const startConsumers = async (): Promise<void> => {
  await consumeIncidentCreated();
  await consumeIncidentDispatched();
  await consumeResponderCreated();
  logger.info('RabbitMQ consumers started');
};

// ─── Consume: incident.created ───────────────────────────────────────────────
const consumeIncidentCreated = async (): Promise<void> => {
  const channel = getChannel();
  if (!channel) { logger.error('RabbitMQ channel not ready'); return; }

  await channel.consume(
    CONSUME_QUEUES.INCIDENT_CREATED,
    async (msg) => {
      if (!msg) return;
      try {
        const event   = JSON.parse(msg.content.toString());
        const payload = event.payload;
        logger.info('Received incident.created', { eventId: event.event_id, incidentId: payload.incident_id });
        dispatchService.broadcastNewIncident(payload);
        channel.ack(msg);
      } catch (err) {
        logger.error('Failed to process incident.created', { error: err });
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  logger.info(`Consumer started: ${CONSUME_QUEUES.INCIDENT_CREATED}`);
};

const consumeIncidentDispatched = async (): Promise<void> => {
  const channel = getChannel();
  if (!channel) { logger.error('RabbitMQ channel not ready'); return; }

  await channel.consume(
    CONSUME_QUEUES.INCIDENT_DISPATCHED,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      try {
        const event   = JSON.parse(msg.content.toString());
        const payload = event.payload as IncidentDispatchedPayload;
        logger.info('Received incident.dispatched', { eventId: event.event_id, incidentId: payload.incident_id });
        await dispatchService.handleIncidentDispatched(payload);
        channel.ack(msg);
      } catch (err) {
        logger.error('Failed to process incident.dispatched', { error: err });
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  logger.info(`Consumer started: ${CONSUME_QUEUES.INCIDENT_DISPATCHED}`);
};

// ─── Consume: responder.created ──────────────────────────────────────────────
// When a Hospital/Police/Fire admin registers a responder in the incident-service,
// automatically provision it as a vehicle in the dispatch-service so it
// appears on the live map without needing a separate manual step.
const consumeResponderCreated = async (): Promise<void> => {
  const channel = getChannel();
  if (!channel) { logger.error('RabbitMQ channel not ready'); return; }

  // Assert the queue (it may not exist yet)
  await channel.assertQueue(RESPONDER_CREATED_QUEUE, {
    durable:   true,
    arguments: { 'x-dead-letter-exchange': 'emergency.dead-letter' },
  });
  await channel.bindQueue(RESPONDER_CREATED_QUEUE, EXCHANGE, 'responder.created');

  await channel.consume(
    RESPONDER_CREATED_QUEUE,
    async (msg: ConsumeMessage | null) => {
      if (!msg) return;
      try {
        const event   = JSON.parse(msg.content.toString());
        const payload = event.payload as {
          responder_id:        string;
          name:                string;
          type:                'AMBULANCE' | 'POLICE' | 'FIRE_TRUCK';
          station_name:        string;
          latitude:            number;
          longitude:           number;
          incident_service_id: string;
        };

        logger.info('Received responder.created — provisioning vehicle', {
          responderId: payload.responder_id,
          type:        payload.type,
        });

        // Check if a vehicle is already registered for this responder
        const existing = await Vehicle.findOne({ incidentServiceId: payload.incident_service_id });
        if (existing) {
          logger.info('Vehicle already exists for responder — skipping', {
            responderId: payload.responder_id,
          });
          channel.ack(msg);
          return;
        }

        // Generate a vehicle code from name + type
        const typePrefix = { AMBULANCE: 'AMB', POLICE: 'POL', FIRE_TRUCK: 'FTK' }[payload.type] ?? 'VEH';
        const code       = `${typePrefix}-${payload.responder_id.slice(-6).toUpperCase()}`;

        const dto: RegisterVehicleDto = {
          vehicleCode:       code,
          type:              payload.type,
          stationId:         payload.responder_id,
          stationName:       payload.station_name,
          incidentServiceId: payload.incident_service_id,
          driverUserId:      'unassigned',
          driverName:        'Unassigned Driver',
          latitude:          payload.latitude,
          longitude:         payload.longitude,
        };

        await dispatchService.registerVehicle(dto);
        logger.info('Vehicle auto-provisioned from responder', { code, type: payload.type });
        channel.ack(msg);
      } catch (err) {
        logger.error('Failed to process responder.created', { error: err });
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );

  logger.info(`Consumer started: ${RESPONDER_CREATED_QUEUE}`);
};
