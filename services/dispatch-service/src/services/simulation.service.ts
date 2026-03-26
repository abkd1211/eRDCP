// ─── GPS Simulation Service ───────────────────────────────────────────────────
// Simulates vehicle movement along a real road route fetched from Mapbox Directions API.
// When an incident is dispatched, this service:
//   1. Fetches the road route from the vehicle's current location to the incident
//   2. Walks the vehicle along the route waypoints at configurable speed
//   3. Emits GPS pings via Socket.io on each step — same events as a real driver
//   4. Auto-updates incident status: IN_PROGRESS at 500m, RESOLVED on arrival
//   5. Supports manual blockage injection mid-journey (reroutes from current position)
//   6. Supports speed multiplier (1x = real-time, 10x = 10x faster for demo)

import axios                         from 'axios';
import { Server as SocketServer }    from 'socket.io';
import { Vehicle }                   from '../models/vehicle.model';
import { DispatchAssignment }        from '../models/dispatchAssignment.model';
import { LocationHistory }           from '../models/locationHistory.model';
import redisClient, { REDIS_KEYS, REDIS_TTL } from '../config/redis';
import { publishEvent, ROUTING_KEYS } from '../config/rabbitmq';
import logger                        from '../config/logger';
import { haversineKm }               from '../utils/geo';
import { SOCKET_EVENTS }             from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Coordinate { lat: number; lng: number; }

interface SimulationState {
  vehicleId:    string;
  incidentId:   string;
  route:        Coordinate[];       // full waypoints along road
  currentIndex: number;             // which waypoint we're at
  destLat:      number;
  destLng:      number;
  speedKmh:     number;             // base speed
  multiplier:   number;             // sim speed multiplier
  blocked:      boolean;            // manual blockage active
  timer:        ReturnType<typeof setTimeout> | null;
  arrivedNotified: boolean;
}

// ─── Module state ─────────────────────────────────────────────────────────────
let io: SocketServer | null = null;
const activeSimulations = new Map<string, SimulationState>();   // vehicleId → state
let globalMultiplier    = 1;   // shared across all active sims

// Mapbox token from env (reuse frontend token or set MAPBOX_TOKEN in dispatch .env)
const MAPBOX_TOKEN = process.env.MAPBOX_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? '';

// ─── Inject Socket.io ─────────────────────────────────────────────────────────
export function setSimulationIO(socketServer: SocketServer): void {
  io = socketServer;
}

// ─── Set global speed multiplier ─────────────────────────────────────────────
export function setSpeedMultiplier(multiplier: number): void {
  globalMultiplier = Math.max(1, Math.min(20, multiplier));
  // Apply to all running simulations
  activeSimulations.forEach((state) => {
    state.multiplier = globalMultiplier;
  });
  logger.info('Simulation speed updated', { multiplier: globalMultiplier });
}

export function getSpeedMultiplier(): number { return globalMultiplier; }

// ─── Trigger manual route blockage ───────────────────────────────────────────
export async function triggerBlockage(vehicleId: string): Promise<boolean> {
  const state = activeSimulations.get(vehicleId);
  if (!state) return false;

  state.blocked = true;
  logger.info('Manual blockage triggered', { vehicleId });

  // Emit deviation event
  const vehicle = await Vehicle.findById(vehicleId);
  if (vehicle && io) {
    io.to(`incident:${state.incidentId}`).emit(SOCKET_EVENTS.ROUTE_DEVIATION, {
      vehicleId,
      vehicleCode:     vehicle.vehicleCode,
      deviationMetres: 800,
      currentLocation: {
        latitude:  state.route[state.currentIndex]?.lat ?? state.destLat,
        longitude: state.route[state.currentIndex]?.lng ?? state.destLng,
      },
    });
    io.to('all-vehicles').emit(SOCKET_EVENTS.ROUTE_DEVIATION, {
      vehicleId,
      vehicleCode:     vehicle.vehicleCode,
      deviationMetres: 800,
      currentLocation: {
        latitude:  state.route[state.currentIndex]?.lat ?? state.destLat,
        longitude: state.route[state.currentIndex]?.lng ?? state.destLng,
      },
    });
  }

  // Reroute from current position
  const currentPos = state.route[state.currentIndex];
  if (currentPos) {
    await rerouteFromPosition(vehicleId, currentPos, state);
  }

  return true;
}

// ─── Fetch road route from Mapbox Directions API ──────────────────────────────
async function fetchRoute(
  originLat:  number, originLng:  number,
  destLat:    number, destLng:    number
): Promise<Coordinate[]> {
  if (!MAPBOX_TOKEN) {
    // Fallback: straight-line interpolation if no token
    logger.warn('No MAPBOX_TOKEN — using straight-line route simulation');
    return buildStraightLine(originLat, originLng, destLat, destLng, 20);
  }

  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    const res = await axios.get(url, { timeout: 8000 });
    const coords: [number, number][] = res.data?.routes?.[0]?.geometry?.coordinates;

    if (!coords || coords.length < 2) {
      return buildStraightLine(originLat, originLng, destLat, destLng, 20);
    }

    // Mapbox returns [lng, lat] — convert to { lat, lng }
    return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch (err) {
    logger.warn('Mapbox Directions failed — using straight-line', { error: (err as Error).message });
    return buildStraightLine(originLat, originLng, destLat, destLng, 20);
  }
}

// Straight-line fallback: interpolate N points between origin and dest
function buildStraightLine(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  steps: number
): Coordinate[] {
  const points: Coordinate[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ lat: lat1 + (lat2 - lat1) * t, lng: lng1 + (lng2 - lng1) * t });
  }
  return points;
}

// ─── Reroute from a mid-journey position ──────────────────────────────────────
async function rerouteFromPosition(
  vehicleId: string,
  from: Coordinate,
  state: SimulationState
): Promise<void> {
  const newRoute = await fetchRoute(from.lat, from.lng, state.destLat, state.destLng);
  state.route        = newRoute;
  state.currentIndex = 0;
  state.blocked      = false;
  logger.info('Vehicle rerouted', { vehicleId, newWaypoints: newRoute.length });
}

// ─── Start simulation for a dispatched vehicle ────────────────────────────────
export async function startSimulation(
  vehicleId:  string,
  incidentId: string,
  originLat:  number,
  originLng:  number,
  destLat:    number,
  destLng:    number,
  baseSpeedKmh = 60
): Promise<void> {
  // Stop any existing simulation for this vehicle
  stopSimulation(vehicleId);

  logger.info('Starting GPS simulation', { vehicleId, incidentId, baseSpeedKmh });

  // Fetch road route
  const route = await fetchRoute(originLat, originLng, destLat, destLng);

  const state: SimulationState = {
    vehicleId,
    incidentId,
    route,
    currentIndex:    0,
    destLat,
    destLng,
    speedKmh:        baseSpeedKmh,
    multiplier:      globalMultiplier,
    blocked:         false,
    timer:           null,
    arrivedNotified: false,
  };

  activeSimulations.set(vehicleId, state);
  scheduleNextStep(state);
}

// ─── Stop simulation ──────────────────────────────────────────────────────────
export function stopSimulation(vehicleId: string): void {
  const state = activeSimulations.get(vehicleId);
  if (state?.timer) clearTimeout(state.timer);
  activeSimulations.delete(vehicleId);
}

// ─── Schedule the next GPS step ──────────────────────────────────────────────
function scheduleNextStep(state: SimulationState): void {
  if (!activeSimulations.has(state.vehicleId)) return;

  const current = state.route[state.currentIndex];
  const next    = state.route[state.currentIndex + 1];

  if (!current || !next) {
    // End of route — vehicle has arrived
    handleArrival(state);
    return;
  }

  // Distance between current and next waypoint
  const segmentKm = haversineKm(current.lat, current.lng, next.lat, next.lng);
  // Time to cover that segment at current speed (ms), adjusted by multiplier
  const segmentMs = Math.max(
    200,
    (segmentKm / (state.speedKmh * state.multiplier)) * 3_600_000
  );

  state.timer = setTimeout(async () => {
    if (!activeSimulations.has(state.vehicleId)) return;

    state.currentIndex++;
    const pos = state.route[state.currentIndex];
    if (!pos) { handleArrival(state); return; }

    // Calculate heading
    const prev    = state.route[state.currentIndex - 1];
    const heading = prev ? getHeading(prev.lat, prev.lng, pos.lat, pos.lng) : 'N';

    // Distance remaining to destination
    const distToDestKm = haversineKm(pos.lat, pos.lng, state.destLat, state.destLng);

    // Speed variation — slightly vary to feel realistic
    const speed = state.speedKmh * (0.85 + Math.random() * 0.3);

    // Build ping payload
    const ping = {
      vehicleId:   state.vehicleId,
      latitude:    pos.lat,
      longitude:   pos.lng,
      speedKmh:    Math.round(speed),
      heading,
      batteryPct:  null,
      timestamp:   new Date().toISOString(),
    };

    try {
      // Update vehicle in MongoDB
      await Vehicle.findByIdAndUpdate(state.vehicleId, {
        'currentLocation.latitude':  pos.lat,
        'currentLocation.longitude': pos.lng,
        'currentLocation.updatedAt': new Date(),
        speedKmh:        Math.round(speed),
        heading,
        lastHeartbeatAt: new Date(),
        isUnresponsive:  false,
      });

      // Store location history
      await LocationHistory.create({
        vehicleId:  state.vehicleId,
        incidentId: state.incidentId,
        latitude:   pos.lat,
        longitude:  pos.lng,
        speedKmh:   Math.round(speed),
        heading,
        recordedAt: new Date(),
      });

      // Cache location in Redis
      await redisClient.setEx(
        REDIS_KEYS.vehicleLocation(state.vehicleId),
        REDIS_TTL.vehicleLocation,
        JSON.stringify({ latitude: pos.lat, longitude: pos.lng, updatedAt: new Date() })
      );

      // ETA calculation
      const etaSec = speed > 0
        ? Math.round((distToDestKm / speed) * 3600)
        : 0;

      const vehicle = await Vehicle.findById(state.vehicleId);
      if (!vehicle) { stopSimulation(state.vehicleId); return; }

      // Build full location update payload
      const locationPayload = {
        vehicleId:   state.vehicleId,
        vehicleCode: vehicle.vehicleCode,
        type:        vehicle.type,
        latitude:    pos.lat,
        longitude:   pos.lng,
        speedKmh:    Math.round(speed),
        heading,
        batteryPct:  null,
        timestamp:   ping.timestamp,
      };

      // Emit to all relevant rooms
      if (io) {
        io.to(`incident:${state.incidentId}`).emit(SOCKET_EVENTS.LOCATION_UPDATE, locationPayload);
        io.to(`vehicle:${state.vehicleId}`).emit(SOCKET_EVENTS.LOCATION_UPDATE, locationPayload);
        io.to('all-vehicles').emit(SOCKET_EVENTS.LOCATION_UPDATE, locationPayload);

        // ETA update
        io.to(`incident:${state.incidentId}`).emit(SOCKET_EVENTS.ETA_UPDATE, {
          vehicleId:   state.vehicleId,
          vehicleCode: vehicle.vehicleCode,
          etaSec,
          etaMinutes:  Math.ceil(etaSec / 60),
          distanceKm:  Math.round(distToDestKm * 100) / 100,
        });
        io.to('all-vehicles').emit(SOCKET_EVENTS.ETA_UPDATE, {
          vehicleId:   state.vehicleId,
          vehicleCode: vehicle.vehicleCode,
          etaSec,
          etaMinutes:  Math.ceil(etaSec / 60),
          distanceKm:  Math.round(distToDestKm * 100) / 100,
        });
      }

      // Publish to analytics
      await publishEvent(ROUTING_KEYS.LOCATION_UPDATED, {
        vehicle_id:  state.vehicleId,
        incident_id: state.incidentId,
        latitude:    pos.lat,
        longitude:   pos.lng,
        speed_kmh:   Math.round(speed),
        heading,
        recorded_at: ping.timestamp,
      });

      // Auto status change: IN_PROGRESS when within 500m
      if (distToDestKm < 0.5 && vehicle.status === 'DISPATCHED') {
        await Vehicle.findByIdAndUpdate(state.vehicleId, { status: 'EN_ROUTE' });
        // Tell incident service via RabbitMQ to update status
        await publishEvent('incident.status.update', {
          incident_id: state.incidentId,
          new_status:  'IN_PROGRESS',
          updated_by:  'simulation',
          note:        `Vehicle ${vehicle.vehicleCode} is within 500m`,
        });
        if (io) {
          io.to('admins').emit('incident:status_update', {
            incidentId: state.incidentId,
            status:     'IN_PROGRESS',
            message:    `${vehicle.vehicleCode} is within 500m of scene`,
          });
        }
      }

    } catch (err) {
      logger.error('Simulation step error', { vehicleId: state.vehicleId, error: err });
    }

    // Schedule next step
    scheduleNextStep(state);
  }, segmentMs);
}

// ─── Handle vehicle arrival ───────────────────────────────────────────────────
async function handleArrival(state: SimulationState): Promise<void> {
  if (state.arrivedNotified) return;
  state.arrivedNotified = true;

  logger.info('Vehicle arrived at scene', { vehicleId: state.vehicleId });

  try {
    const vehicle = await Vehicle.findById(state.vehicleId);
    if (!vehicle) return;

    const now       = new Date();
    const arrivalSec= 0;

    // Update vehicle
    await Vehicle.findByIdAndUpdate(state.vehicleId, {
      status:         'ON_SCENE',
      routeDeviation: false,
    });

    // Update assignment
    await DispatchAssignment.findOneAndUpdate(
      { vehicleId: state.vehicleId, incidentId: state.incidentId },
      { status: 'ON_SCENE', actualArrivalAt: now }
    );

    if (io) {
      const arrivedPayload = {
        vehicleId:   state.vehicleId,
        vehicleCode: vehicle.vehicleCode,
        arrivalSec,
        arrivedAt:   now.toISOString(),
      };

      io.to(`incident:${state.incidentId}`).emit(SOCKET_EVENTS.VEHICLE_ARRIVED, arrivedPayload);
      io.to(`vehicle:${state.vehicleId}`).emit(SOCKET_EVENTS.VEHICLE_ARRIVED, arrivedPayload);
      io.to('all-vehicles').emit(SOCKET_EVENTS.VEHICLE_ARRIVED, arrivedPayload);

      // Auto-resolve incident
      await publishEvent('incident.status.update', {
        incident_id: state.incidentId,
        new_status:  'RESOLVED',
        updated_by:  'simulation',
        note:        `Vehicle ${vehicle.vehicleCode} arrived on scene`,
      });

      io.to('admins').emit('incident:status_update', {
        incidentId: state.incidentId,
        status:     'RESOLVED',
        message:    `${vehicle.vehicleCode} arrived on scene — incident resolved`,
      });
    }

  } catch (err) {
    logger.error('Arrival handling error', { vehicleId: state.vehicleId, error: err });
  } finally {
    stopSimulation(state.vehicleId);
  }
}

// ─── Compass heading from two coordinates ────────────────────────────────────
function getHeading(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const dLng   = lng2 - lng1;
  const dLat   = lat2 - lat1;
  const angle  = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  const norm   = (angle + 360) % 360;
  const dirs   = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(norm / 45) % 8];
}

// ─── Get all active simulations (for status endpoint) ────────────────────────
export function getActiveSimulations(): string[] {
  return Array.from(activeSimulations.keys());
}
