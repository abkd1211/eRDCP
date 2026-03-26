import { Server as SocketServer } from 'socket.io';
import { Vehicle, IVehicle }              from '../models/vehicle.model';
import { LocationHistory }                from '../models/locationHistory.model';
import { DispatchAssignment }             from '../models/dispatchAssignment.model';
import redisClient, { REDIS_KEYS, REDIS_TTL } from '../config/redis';
import { publishEvent, ROUTING_KEYS }     from '../config/rabbitmq';
import { env }                            from '../config/env';
import logger                             from '../config/logger';
import {
  haversineKm,
  calculateEtaSec,
  crossTrackDistanceMetres,
} from '../utils/geo';
import {
  GpsPingDto,
  RegisterVehicleDto,
  SOCKET_EVENTS,
  IncidentDispatchedPayload,
  IncidentCreatedPayload,
} from '../types';
import {
  startSimulation,
  setSimulationIO,
} from './simulation.service';

export class DispatchService {
  private io: SocketServer | null = null;

  // ─── Inject Socket.io server ──────────────────────────────────────────────
  setSocketServer(io: SocketServer): void {
    this.io = io;
    // Also wire the simulation service so it can emit events
    setSimulationIO(io);
  }

  // ═══════════════════════════════════════════════════════
  // VEHICLE REGISTRATION
  // ═══════════════════════════════════════════════════════

  async registerVehicle(dto: RegisterVehicleDto): Promise<IVehicle> {
    const existing = await Vehicle.findOne({ vehicleCode: dto.vehicleCode });
    if (existing) {
      throw Object.assign(
        new Error(`Vehicle code ${dto.vehicleCode} already registered`),
        { status: 409, code: 'VEHICLE_EXISTS' }
      );
    }

    const vehicle = await Vehicle.create({
      vehicleCode:       dto.vehicleCode,
      type:              dto.type,
      stationId:         dto.stationId,
      stationName:       dto.stationName,
      incidentServiceId: dto.incidentServiceId,
      driverUserId:      dto.driverUserId,
      driverName:        dto.driverName,
      status:            'AVAILABLE',
      currentLocation: {
        latitude:  dto.latitude,
        longitude: dto.longitude,
        updatedAt: new Date(),
      },
      lastHeartbeatAt: new Date(),
    });

    logger.info('Vehicle registered', { vehicleId: vehicle._id.toString(), code: vehicle.vehicleCode });
    return vehicle;
  }

  // ═══════════════════════════════════════════════════════
  // GPS PING PROCESSING  ← The main real-time loop
  // ═══════════════════════════════════════════════════════

  async processGpsPing(dto: GpsPingDto): Promise<void> {
    const vehicle = await Vehicle.findById(dto.vehicleId);
    if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { status: 404 });

    const now = new Date();

    // 1. Update vehicle document
    await Vehicle.findByIdAndUpdate(dto.vehicleId, {
      'currentLocation.latitude':  dto.latitude,
      'currentLocation.longitude': dto.longitude,
      'currentLocation.updatedAt': now,
      speedKmh:        dto.speedKmh   ?? 0,
      heading:         dto.heading    ?? 'N',
      batteryPct:      dto.batteryPct ?? null,
      lastHeartbeatAt: now,
      isUnresponsive:  false,
    });

    // 2. Persist to location history
    await LocationHistory.create({
      vehicleId:  dto.vehicleId,
      incidentId: vehicle.currentIncidentId,
      latitude:   dto.latitude,
      longitude:  dto.longitude,
      speedKmh:   dto.speedKmh   ?? 0,
      heading:    dto.heading    ?? 'N',
      batteryPct: dto.batteryPct ?? null,
      recordedAt: now,
    });

    // 3. Cache latest location in Redis (30s TTL)
    await redisClient.setEx(
      REDIS_KEYS.vehicleLocation(dto.vehicleId),
      REDIS_TTL.vehicleLocation,
      JSON.stringify({ latitude: dto.latitude, longitude: dto.longitude, updatedAt: now })
    );

    // 4. Refresh heartbeat key
    await redisClient.setEx(
      REDIS_KEYS.vehicleHeartbeat(dto.vehicleId),
      REDIS_TTL.vehicleHeartbeat,
      '1'
    );

    // 5. Publish location.updated event to RabbitMQ → Analytics service
    await publishEvent(ROUTING_KEYS.LOCATION_UPDATED, {
      vehicle_id:  dto.vehicleId,
      incident_id: vehicle.currentIncidentId,
      latitude:    dto.latitude,
      longitude:   dto.longitude,
      speed_kmh:   dto.speedKmh ?? 0,
      heading:     dto.heading  ?? 'N',
      recorded_at: now.toISOString(),
    });

    // 6. Emit real-time update via Socket.io
    const locationPayload = {
      vehicleId:   dto.vehicleId,
      vehicleCode: vehicle.vehicleCode,
      type:        vehicle.type,
      latitude:    dto.latitude,
      longitude:   dto.longitude,
      speedKmh:    dto.speedKmh   ?? 0,
      heading:     dto.heading    ?? 'N',
      batteryPct:  dto.batteryPct ?? null,
      timestamp:   now.toISOString(),
    };

    // Broadcast to incident room, vehicle room, and global all-vehicles room
    if (vehicle.currentIncidentId) {
      this.io?.to(`incident:${vehicle.currentIncidentId}`).emit(SOCKET_EVENTS.LOCATION_UPDATE, locationPayload);
    }
    this.io?.to(`vehicle:${dto.vehicleId}`).emit(SOCKET_EVENTS.LOCATION_UPDATE, locationPayload);
    this.io?.to('all-vehicles').emit(SOCKET_EVENTS.LOCATION_UPDATE, locationPayload);

    // 7. Run extra feature checks (async, non-blocking)
    this.runChecks(vehicle, dto).catch(err =>
      logger.error('Error in GPS checks', { vehicleId: dto.vehicleId, error: err })
    );
  }

  // ═══════════════════════════════════════════════════════
  // EXTRA FEATURES — ETA + DEVIATION + ARRIVAL DETECTION
  // ═══════════════════════════════════════════════════════

  private async runChecks(vehicle: IVehicle, ping: GpsPingDto): Promise<void> {
    if (!vehicle.currentIncidentId) return;

    const assignment = await DispatchAssignment.findOne({
      vehicleId:  vehicle._id.toString(),
      incidentId: vehicle.currentIncidentId,
      status:     { $in: ['ASSIGNED', 'EN_ROUTE'] },
    });

    if (!assignment) return;

    // ── ETA Calculation ───────────────────────────────────────────────────────
    const etaSec = calculateEtaSec(
      ping.latitude,    ping.longitude,
      assignment.destLatitude, assignment.destLongitude,
      ping.speedKmh ?? 0
    );

    await DispatchAssignment.findByIdAndUpdate(assignment.id, { estimatedArrivalSec: etaSec });
    await redisClient.setEx(
      REDIS_KEYS.vehicleEta(vehicle._id.toString()),
      REDIS_TTL.vehicleEta,
      String(etaSec)
    );

    // Emit ETA update to incident room
    this.io?.to(`incident:${vehicle.currentIncidentId}`).emit(SOCKET_EVENTS.ETA_UPDATE, {
      vehicleId:   vehicle._id.toString(),
      vehicleCode: vehicle.vehicleCode,
      etaSec,
      etaMinutes:  Math.ceil(etaSec / 60),
    });

    // ── Route Deviation Detection ─────────────────────────────────────────────
    const deviationMetres = crossTrackDistanceMetres(
      ping.latitude,    ping.longitude,
      assignment.originLatitude,  assignment.originLongitude,
      assignment.destLatitude,    assignment.destLongitude
    );

    const isDeviating = deviationMetres > env.MAX_ROUTE_DEVIATION_METRES;

    if (isDeviating && !vehicle.routeDeviation) {
      await Vehicle.findByIdAndUpdate(vehicle._id.toString(), { routeDeviation: true });

      logger.warn('Route deviation detected', {
        vehicleId:       vehicle._id.toString(),
        deviationMetres: Math.round(deviationMetres),
      });

      this.io?.to(`incident:${vehicle.currentIncidentId}`).emit(SOCKET_EVENTS.ROUTE_DEVIATION, {
        vehicleId:       vehicle._id.toString(),
        vehicleCode:     vehicle.vehicleCode,
        deviationMetres: Math.round(deviationMetres),
        currentLocation: { latitude: ping.latitude, longitude: ping.longitude },
      });
    } else if (!isDeviating && vehicle.routeDeviation) {
      // Back on route — clear the flag
      await Vehicle.findByIdAndUpdate(vehicle._id.toString(), { routeDeviation: false });
    }

    // ── Arrival Detection ─────────────────────────────────────────────────────
    // If vehicle is within 100m of destination, consider it arrived
    const distToDestKm = haversineKm(
      ping.latitude, ping.longitude,
      assignment.destLatitude, assignment.destLongitude
    );

    if (distToDestKm < 0.1 && assignment.status === 'EN_ROUTE') {
      const now        = new Date();
      const arrivalSec = Math.floor((now.getTime() - assignment.assignedAt.getTime()) / 1000);

      await DispatchAssignment.findByIdAndUpdate(assignment.id, {
        status:           'ON_SCENE',
        arrivedAt:        now,
        actualArrivalSec: arrivalSec,
      });

      await Vehicle.findByIdAndUpdate(vehicle._id.toString(), { status: 'ON_SCENE' });

      logger.info('Vehicle arrived at scene', { vehicleId: vehicle._id.toString(), arrivalSec });

      this.io?.to(`incident:${vehicle.currentIncidentId}`).emit(SOCKET_EVENTS.VEHICLE_ARRIVED, {
        vehicleId:   vehicle._id.toString(),
        vehicleCode: vehicle.vehicleCode,
        arrivalSec,
        arrivedAt:   now.toISOString(),
      });
    }
  }

  // ═══════════════════════════════════════════════════════
  // HEARTBEAT MONITOR — runs on a cron interval
  // ═══════════════════════════════════════════════════════

  async checkHeartbeats(): Promise<void> {
    // Find all active vehicles (dispatched / en route)
    const activeVehicles = await Vehicle.find({
      status:         { $in: ['DISPATCHED', 'EN_ROUTE', 'ON_SCENE'] },
      isUnresponsive: false,
    });

    for (const vehicle of activeVehicles) {
      const alive = await redisClient.get(REDIS_KEYS.vehicleHeartbeat(vehicle._id.toString()));

      if (!alive) {
        // Vehicle has not sent a ping within HEARTBEAT_TIMEOUT_SEC
        await Vehicle.findByIdAndUpdate(vehicle._id.toString(), { isUnresponsive: true });

        logger.warn('Vehicle unresponsive', {
          vehicleId:   vehicle._id.toString(),
          vehicleCode: vehicle.vehicleCode,
          lastSeen:    vehicle.lastHeartbeatAt,
        });

        // Emit alert to frontend
        if (vehicle.currentIncidentId) {
          this.io?.to(`incident:${vehicle.currentIncidentId}`).emit(
            SOCKET_EVENTS.VEHICLE_UNRESPONSIVE, {
              vehicleId:   vehicle._id.toString(),
              vehicleCode: vehicle.vehicleCode,
              lastSeenAt:  vehicle.lastHeartbeatAt,
            }
          );
        }

        // Publish to RabbitMQ → analytics
        await publishEvent(ROUTING_KEYS.VEHICLE_UNRESPONSIVE, {
          vehicle_id:   vehicle._id.toString(),
          vehicle_code: vehicle.vehicleCode,
          incident_id:  vehicle.currentIncidentId,
          last_seen_at: vehicle.lastHeartbeatAt,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // TRIP COMPLETION & SUMMARY
  // ═══════════════════════════════════════════════════════

  async completeTrip(vehicleId: string, incidentId: string): Promise<void> {
    const assignment = await DispatchAssignment.findOne({ vehicleId, incidentId });
    if (!assignment) return;

    const now = new Date();

    // Aggregate location history to compute trip stats
    const history = await LocationHistory.find({
      vehicleId,
      incidentId,
      recordedAt: { $gte: assignment.assignedAt },
    }).sort({ recordedAt: 1 });

    let totalDistanceKm = 0;
    let maxSpeedKmh     = 0;
    let totalSpeedKmh   = 0;

    for (let i = 1; i < history.length; i++) {
      totalDistanceKm += haversineKm(
        history[i - 1].latitude, history[i - 1].longitude,
        history[i].latitude,     history[i].longitude
      );
      if (history[i].speedKmh > maxSpeedKmh) maxSpeedKmh = history[i].speedKmh;
      totalSpeedKmh += history[i].speedKmh;
    }

    const durationSec = Math.floor((now.getTime() - assignment.assignedAt.getTime()) / 1000);
    const avgSpeedKmh = history.length > 0 ? totalSpeedKmh / history.length : 0;

    const tripSummary = {
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      durationSec,
      avgSpeedKmh:     Math.round(avgSpeedKmh * 10) / 10,
      maxSpeedKmh:     Math.round(maxSpeedKmh * 10) / 10,
      pingCount:       history.length,
    };

    await DispatchAssignment.findByIdAndUpdate(assignment.id, {
      status:      'COMPLETED',
      completedAt: now,
      tripSummary,
    });

    await Vehicle.findByIdAndUpdate(vehicleId, {
      status:            'AVAILABLE',
      currentIncidentId: null,
      routeDeviation:    false,
    });

    logger.info('Trip completed', { vehicleId, incidentId, tripSummary });

    // Emit to frontend
    this.io?.to(`incident:${incidentId}`).emit(SOCKET_EVENTS.TRIP_COMPLETED, {
      vehicleId,
      incidentId,
      tripSummary,
      completedAt: now.toISOString(),
    });

    // Publish to RabbitMQ → analytics
    await publishEvent(ROUTING_KEYS.TRIP_COMPLETED, {
      vehicle_id:   vehicleId,
      incident_id:  incidentId,
      trip_summary: tripSummary,
      completed_at: now.toISOString(),
    });
  }

  // ═══════════════════════════════════════════════════════
  // QUERIES
  // ═══════════════════════════════════════════════════════

  async getVehicles(type?: string, status?: string) {
    const filter: Record<string, unknown> = {};
    if (type)   filter.type   = type;
    if (status) filter.status = status;
    return Vehicle.find(filter).sort({ vehicleCode: 1 });
  }

  async getVehicleById(id: string) {
    const vehicle = await Vehicle.findById(id);
    if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { status: 404, code: 'NOT_FOUND' });
    return vehicle;
  }

  async getVehicleLocation(vehicleId: string) {
    // Try Redis cache first
    const cached = await redisClient.get(REDIS_KEYS.vehicleLocation(vehicleId));
    if (cached) return { ...JSON.parse(cached), source: 'cache' };

    const vehicle = await Vehicle.findById(vehicleId, 'currentLocation vehicleCode type status');
    if (!vehicle) throw Object.assign(new Error('Vehicle not found'), { status: 404, code: 'NOT_FOUND' });

    return { latitude: vehicle.currentLocation.latitude, longitude: vehicle.currentLocation.longitude, updatedAt: vehicle.currentLocation.updatedAt, source: 'db' };
  }

  async getVehicleLocationHistory(vehicleId: string, limit = 100) {
    return LocationHistory.find({ vehicleId })
      .sort({ recordedAt: -1 })
      .limit(limit);
  }

  async getVehiclesByIncident(incidentId: string) {
    return Vehicle.find({ currentIncidentId: incidentId });
  }

  async getActiveAssignment(vehicleId: string) {
    return DispatchAssignment.findOne({
      vehicleId,
      status: { $in: ['ASSIGNED', 'EN_ROUTE', 'ON_SCENE'] },
    });
  }

  // ═══════════════════════════════════════════════════════
  // ADMIN BROADCAST — Situational Awareness
  // ═══════════════════════════════════════════════════════

  // Called when incident.created event arrives from RabbitMQ.
  // Broadcasts to ALL connected admins so they have real-time
  // awareness of every new incident — preventing duplicate dispatch.
  broadcastNewIncident(payload: IncidentCreatedPayload): void {
    this.io?.to('admins').emit('incident:new', {
      incidentId:      payload.incident_id,
      incidentType:    payload.incident_type,
      latitude:        payload.latitude,
      longitude:       payload.longitude,
      citizenName:     payload.citizen_name,
      status:          payload.status,
      assignedUnitId:  payload.assigned_unit_id,
      priority:        payload.priority,
      createdAt:       payload.created_at,
    });
    logger.debug('Broadcast new incident to all admins', { incidentId: payload.incident_id });
  }

  // Broadcasts priority escalation when a linked report auto-escalates an incident.
  broadcastPriorityEscalation(incidentId: string, newPriority: number, reportCount: number): void {
    this.io?.to('admins').emit('incident:priority_escalated', {
      incidentId,
      newPriority,
      reportCount,
      message: `Incident now has ${reportCount} reports — priority escalated to ${newPriority === 3 ? 'CRITICAL' : 'HIGH'}`,
    });
  }

  // ═══════════════════════════════════════════════════════
  // RABBITMQ EVENT HANDLERS
  // ═══════════════════════════════════════════════════════

  async handleIncidentDispatched(payload: IncidentDispatchedPayload): Promise<void> {
    // Find the vehicle registered for this responder
    const vehicle = await Vehicle.findOne({ incidentServiceId: payload.assigned_unit_id });
    if (!vehicle) {
      logger.warn('No vehicle found for dispatched responder', {
        assignedUnitId: payload.assigned_unit_id,
      });
      return;
    }

    // Get current vehicle location for assignment origin
    const location = await this.getVehicleLocation(vehicle._id.toString());

    // Create dispatch assignment
    await DispatchAssignment.create({
      vehicleId:      vehicle._id.toString(),
      incidentId:     payload.incident_id,
      driverUserId:   vehicle.driverUserId,
      status:         'ASSIGNED',
      assignedAt:     new Date(payload.dispatched_at),
      originLatitude:  location.latitude,
      originLongitude: location.longitude,
      destLatitude:    payload.latitude,
      destLongitude:   payload.longitude,
    });

    // Update vehicle status
    await Vehicle.findByIdAndUpdate(vehicle._id.toString(), {
      status:            'DISPATCHED',
      currentIncidentId: payload.incident_id,
    });

    logger.info('Vehicle dispatched to incident', {
      vehicleId:  vehicle._id.toString(),
      incidentId: payload.incident_id,
    });

    // Notify the frontend
    this.io?.to(`vehicle:${vehicle._id.toString()}`).emit(SOCKET_EVENTS.VEHICLE_STATUS, {
      vehicleId:  vehicle._id.toString(),
      status:     'DISPATCHED',
      incidentId: payload.incident_id,
    });

    // ── Start GPS simulation automatically ───────────────────────────────────
    // Uses Mapbox Directions API to fetch a real road route, then walks the
    // vehicle along it emitting live GPS pings — exactly like a real driver.
    startSimulation(
      vehicle._id.toString(),
      payload.incident_id,
      location.latitude,
      location.longitude,
      payload.latitude,
      payload.longitude,
      60  // base speed km/h — adjustable via /simulation/speed
    ).catch((err) =>
      logger.error('Failed to start simulation', { vehicleId: vehicle._id.toString(), error: err })
    );
  }
}

export default new DispatchService();
