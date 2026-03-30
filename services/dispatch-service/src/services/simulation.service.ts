// ─── GPS Simulation Service ───────────────────────────────────────────────────
// Simulates vehicle movement along a real road route fetched from Mapbox Directions API.
// When an incident is dispatched, this service:
//   1. Fetches the road route from the vehicle's current location to the incident
//   2. Walks the vehicle along the route waypoints at configurable speed
//   3. Emits GPS pings via Socket.io on each step — same events as a real driver
//   4. Auto-updates incident status: IN_PROGRESS at 500m, RESOLVED on arrival
//   5. Supports manual blockage injection mid-journey (reroutes from current position)
//   6. Supports speed multiplier (1x = real-time, 10x = 10x faster for demo)

import axios from 'axios';
import { Server as SocketServer } from 'socket.io';
import { Vehicle } from '../models/vehicle.model';
import { DispatchAssignment } from '../models/dispatchAssignment.model';
import { LocationHistory } from '../models/locationHistory.model';
import redisClient, { REDIS_KEYS, REDIS_TTL } from '../config/redis';
import { publishEvent, ROUTING_KEYS } from '../config/rabbitmq';
import logger from '../config/logger';
import { haversineKm } from '../utils/geo';
import { SOCKET_EVENTS } from '../types';

// ─── Types ────────────────────────────────────────────────────────────────────
interface Coordinate { lat: number; lng: number; }

interface SimulationState {
  vehicleId: string;
  incidentId: string | null;
  route: Coordinate[];       // densified waypoints along road
  currentIndex: number;
  destLat: number;
  destLng: number;
  speedKmh: number;
  multiplier: number;
  blocked: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  arrivedNotified: boolean;
  inProgressNotified: boolean; // avoid double status updates
  isReturnTrip?: boolean;
  totalDistanceKm: number;
  dispatchedAt: number;       // unix ms
}

// ─── Module state ─────────────────────────────────────────────────────────────
let io: SocketServer | null = null;
const activeSimulations = new Map<string, SimulationState>();   // vehicleId → state
let globalMultiplier = 1;   // shared across all active sims

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
      vehicleCode: vehicle.vehicleCode,
      deviationMetres: 800,
      currentLocation: {
        latitude: state.route[state.currentIndex]?.lat ?? state.destLat,
        longitude: state.route[state.currentIndex]?.lng ?? state.destLng,
      },
    });
    io.to('all-vehicles').emit(SOCKET_EVENTS.ROUTE_DEVIATION, {
      vehicleId,
      vehicleCode: vehicle.vehicleCode,
      deviationMetres: 800,
      currentLocation: {
        latitude: state.route[state.currentIndex]?.lat ?? state.destLat,
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
  originLat: number, originLng: number,
  destLat: number, destLng: number
): Promise<Coordinate[]> {
  if (!MAPBOX_TOKEN) {
    // Fallback: straight-line interpolation if no token
    logger.warn('No MAPBOX_TOKEN — using straight-line route simulation');
    return buildStraightLine(originLat, originLng, destLat, destLng, 30);
  }

  try {
    const url =
      `https://api.mapbox.com/directions/v5/mapbox/driving/` +
      `${originLng},${originLat};${destLng},${destLat}` +
      `?geometries=geojson&overview=full&access_token=${MAPBOX_TOKEN}`;

    const res = await axios.get(url, { timeout: 8000 });
    const coords: [number, number][] = res.data?.routes?.[0]?.geometry?.coordinates;

    if (!coords || coords.length < 2) {
      return buildStraightLine(originLat, originLng, destLat, destLng, 30);
    }

    // Mapbox returns [lng, lat] — convert to { lat, lng }
    return coords.map(([lng, lat]) => ({ lat, lng }));
  } catch (err) {
    logger.warn('Mapbox Directions failed — using straight-line', { error: (err as Error).message });
    return buildStraightLine(originLat, originLng, destLat, destLng, 30);
  }
}

// Straight-line fallback: interpolate N points between origin and dest
function buildStraightLine(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
  steps = 200
): Coordinate[] {
  const points: Coordinate[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    points.push({ lat: lat1 + (lat2 - lat1) * t, lng: lng1 + (lng2 - lng1) * t });
  }
  return points;
}

/**
 * Densifies a route by adding intermediate waypoints ensuring no segment is
 * longer than maxSpacingKm. This allows for smooth "gliding" on the map.
 */
function densifyRoute(route: Coordinate[], maxSpacingKm = 0.015): Coordinate[] {
  if (route.length < 2) return route;
  const densified: Coordinate[] = [route[0]];

  for (let i = 0; i < route.length - 1; i++) {
    const start = route[i];
    const end = route[i + 1];
    const dist = haversineKm(start.lat, start.lng, end.lat, end.lng);
    const splitSteps = Math.ceil(dist / maxSpacingKm);

    if (splitSteps > 1) {
      for (let j = 1; j < splitSteps; j++) {
        const t = j / splitSteps;
        densified.push({
          lat: start.lat + (end.lat - start.lat) * t,
          lng: start.lng + (end.lng - start.lng) * t,
        });
      }
    }
    densified.push(end);
  }
  return densified;
}

// ─── Reroute from a mid-journey position ──────────────────────────────────────
async function rerouteFromPosition(
  vehicleId: string,
  from: Coordinate,
  state: SimulationState
): Promise<void> {
  const newRoute = await fetchRoute(from.lat, from.lng, state.destLat, state.destLng);
  state.route = newRoute;
  state.currentIndex = 0;
  state.blocked = false;
  logger.info('Vehicle rerouted', { vehicleId, newWaypoints: newRoute.length });
}

// ─── Start simulation for a dispatched vehicle ────────────────────────────────
export async function startSimulation(
  vehicleId: string,
  incidentId: string,
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  baseSpeedKmh = 60
): Promise<void> {
  // Stop any existing simulation for this vehicle
  stopSimulation(vehicleId);

  logger.info('Starting GPS simulation', { vehicleId, incidentId, baseSpeedKmh });

  // Fetch road route and densify for smooth movement
  const rawRoute = await fetchRoute(originLat, originLng, destLat, destLng);
  const route = densifyRoute(rawRoute, 0.03); // points every 30m

  logger.info('Route fetched and densified', { vehicleId, rawPoints: rawRoute.length, densePoints: route.length });

  // Update vehicle and assignment to EN_ROUTE immediately so UI tracks it
  await Vehicle.findByIdAndUpdate(vehicleId, { status: 'EN_ROUTE' });
  if (incidentId) {
    await DispatchAssignment.findOneAndUpdate(
      { vehicleId, incidentId },
      { status: 'EN_ROUTE' }
    );
  }

  const state: SimulationState = {
    vehicleId,
    incidentId,
    route,
    currentIndex: 0,
    destLat,
    destLng,
    speedKmh: baseSpeedKmh,
    multiplier: globalMultiplier,
    blocked: false,
    timer: null,
    arrivedNotified: false,
    inProgressNotified: false,
    totalDistanceKm: 0,
    dispatchedAt: Date.now(),
  };

  activeSimulations.set(vehicleId, state);

  // Immediate DB sync so frontend reflects status on next poll/refresh
  await Vehicle.findByIdAndUpdate(vehicleId, {
    status: 'EN_ROUTE',
    currentIncidentId: incidentId,
  });

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
  const next = state.route[state.currentIndex + 1];

  if (!current || !next) {
    // End of route — vehicle has arrived
    handleArrival(state);
    return;
  }

  // Distance between current and next densified waypoint
  const segmentKm = haversineKm(current.lat, current.lng, next.lat, next.lng);
  state.totalDistanceKm += segmentKm;

  // Time to cover this small 30m segment at current speed, adjusted by multiplier.
  // Floor at 200ms to allow up to 5 pings/sec for high-speed simulation.
  const segmentMs = Math.max(
    500,
    (segmentKm / (state.speedKmh * state.multiplier)) * 3_600_000
  );

  state.timer = setTimeout(async () => {
    if (!activeSimulations.has(state.vehicleId)) return;

    state.currentIndex++;
    const pos = state.route[state.currentIndex];
    if (!pos) { handleArrival(state); return; }

    // Distance remaining to destination
    const distToDestKm = haversineKm(pos.lat, pos.lng, state.destLat, state.destLng);

    // Calculate heading from move
    const prev = state.route[state.currentIndex - 1];
    const heading = prev ? getHeading(prev.lat, prev.lng, pos.lat, pos.lng) : 'N';

    // Speed variation for realism
    const speed = state.speedKmh * (0.9 + Math.random() * 0.2);

    try {
      // 1. Update vehicle state
      const vehicle = await Vehicle.findByIdAndUpdate(state.vehicleId, {
        'currentLocation.latitude': pos.lat,
        'currentLocation.longitude': pos.lng,
        'currentLocation.updatedAt': new Date(),
        speedKmh: Math.round(speed),
        heading,
        lastHeartbeatAt: new Date(),
        isUnresponsive: false,
      }, { returnDocument: 'after' });

      if (!vehicle) { stopSimulation(state.vehicleId); return; }
      
      // 2. Refresh heartbeat in Redis so heartbeat service knows simulation is active
      await redisClient.setEx(
        REDIS_KEYS.vehicleHeartbeat(state.vehicleId),
        REDIS_TTL.vehicleHeartbeat,
        '1'
      );

      // 3. Emit location update via Socket.io
      if (io) {
        const payload = {
          vehicleId:   state.vehicleId,
          vehicleCode: vehicle.vehicleCode,
          type:        vehicle.type,
          driverUserId:vehicle.driverUserId,
          driverName:  vehicle.driverName || 'System Simulation',
          latitude:    pos.lat,
          longitude:   pos.lng,
          speedKmh:    Math.round(speed),
          heading,
          batteryPct:  vehicle.batteryPct || 85,
          status:      vehicle.status,
          incidentId:  state.incidentId,
          timestamp:   new Date().toISOString(),
        };

        // Broadcast to all tracking rooms
        io.to(`incident:${state.incidentId}`).emit(SOCKET_EVENTS.LOCATION_UPDATE, payload);
        io.to(`vehicle:${state.vehicleId}`).emit(SOCKET_EVENTS.LOCATION_UPDATE, payload);
        io.to('all-vehicles').emit(SOCKET_EVENTS.LOCATION_UPDATE, payload);
        io.to('admins').emit(SOCKET_EVENTS.LOCATION_UPDATE, payload);

        // Update ETA (based on real speed)
        const etaSec = speed > 5 ? Math.round((distToDestKm / speed) * 3600) : 0;
        io.to(`incident:${state.incidentId}`).emit(SOCKET_EVENTS.ETA_UPDATE, {
          vehicleId: state.vehicleId,
          vehicleCode: vehicle.vehicleCode,
          etaSec,
          etaMinutes: Math.ceil(etaSec / 60),
          distanceKm: Math.round(distToDestKm * 100) / 100,
        });
      }

      // 3. Periodic persistence & analytics (every 5 pings or ~10s at 1x)
      if (state.currentIndex % 5 === 0) {
        // Store location history
        await LocationHistory.create({
          vehicleId: state.vehicleId,
          incidentId: state.incidentId,
          latitude: pos.lat,
          longitude: pos.lng,
          speedKmh: Math.round(speed),
          heading,
          recordedAt: new Date(),
        });

        // Cache in Redis
        await redisClient.setEx(
          REDIS_KEYS.vehicleLocation(state.vehicleId),
          REDIS_TTL.vehicleLocation,
          JSON.stringify({ latitude: pos.lat, longitude: pos.lng, updatedAt: new Date() })
        );

        // Publish to analytics service
        await publishEvent(ROUTING_KEYS.LOCATION_UPDATED, {
          vehicle_id: state.vehicleId,
          incident_id: state.incidentId,
          latitude: pos.lat,
          longitude: pos.lng,
          speed_kmh: Math.round(speed),
          heading,
          recorded_at: new Date().toISOString(),
        });
      }

      // 3. Proximity-based status triggers
      if (state.incidentId || state.isReturnTrip) {
        // Trigger IN_PROGRESS (Responding) at 500m (Only for active incidents)
        if (!state.isReturnTrip && state.incidentId && distToDestKm < 0.5 && !state.inProgressNotified) {
          state.inProgressNotified = true;
          await publishEvent('incident.status.update', {
            incident_id: state.incidentId,
            new_status: 'IN_PROGRESS',
            updated_by: 'simulation',
            note: `Vehicle ${vehicle.vehicleCode} is approaching scene (within 500m)`,
          });
          io?.to('admins').emit('incident:status_update', {
            incidentId: state.incidentId,
            status: 'IN_PROGRESS',
            message: `${vehicle.vehicleCode} is arriving on scene`,
          });
        }

        // Trigger Arrival at 50m (For both incident scene and home station)
        if (distToDestKm < 0.05) {
          handleArrival(state);
          return;
        }
      }
    } catch (err) {
      logger.error('Simulation step error', { vehicleId: state.vehicleId, error: err });
    }

    // Schedule next step along the densified route
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

    const now = new Date();

    if (state.isReturnTrip) {
      // Logic for returning to station
      await Vehicle.findByIdAndUpdate(state.vehicleId, {
        status: 'AVAILABLE',
        currentIncidentId: null,
        routeDeviation: false,
        speedKmh: 0,
      });

      logger.info('Vehicle returned to station', { vehicleId: state.vehicleId });

      // Publish trip.completed (even if return trip, we can send total distance)
      await publishEvent('trip.completed', {
        vehicle_id: state.vehicleId,
        incident_id: state.incidentId, // might be null, analytics should handle
        trip_summary: {
          totalDistanceKm: Math.round(state.totalDistanceKm * 100) / 100,
          endTimestamp: new Date().toISOString(),
        }
      });

      if (io) {
        io.to(`vehicle:${state.vehicleId}`).emit(SOCKET_EVENTS.VEHICLE_ARRIVED, {
          vehicleId: state.vehicleId,
          message: 'Back at station',
          status: 'AVAILABLE'
        });
      }
    } else {
      // Logic for arriving at incident scene
      // Calculate real response time from when the simulation started
      const arrivalSec = Math.round((Date.now() - state.dispatchedAt) / 1000);

      // Update vehicle
      await Vehicle.findByIdAndUpdate(state.vehicleId, {
        status: 'ON_SCENE',
        routeDeviation: false,
      });

      // Update assignment with real arrival time
      if (state.incidentId) {
        await DispatchAssignment.findOneAndUpdate(
          { vehicleId: state.vehicleId, incidentId: state.incidentId },
          { status: 'ON_SCENE', actualArrivalAt: now, actualArrivalSec: arrivalSec }
        );
      }

      if (io) {
        const arrivedPayload = {
          vehicleId:   state.vehicleId,
          vehicleCode: vehicle.vehicleCode,
          incidentId:  state.incidentId,
          arrivalSec,
          arrivedAt:   now.toISOString(),
        };

        io.to(`incident:${state.incidentId}`).emit(SOCKET_EVENTS.VEHICLE_ARRIVED, arrivedPayload);
        io.to(`vehicle:${state.vehicleId}`).emit(SOCKET_EVENTS.VEHICLE_ARRIVED, arrivedPayload);
        io.to('all-vehicles').emit(SOCKET_EVENTS.VEHICLE_ARRIVED, arrivedPayload);

        // Notify admins the vehicle is on scene
        io.to('admins').emit('incident:on_scene', {
          incidentId:  state.incidentId,
          vehicleCode: vehicle.vehicleCode,
          arrivalSec,
          message: `${vehicle.vehicleCode} arrived on scene — response time ${Math.round(arrivalSec / 60)} min`,
        });

        // Auto-resolve after a pause to ensure visibility
        if (state.incidentId) {
          setTimeout(async () => {
            try {
              await publishEvent('incident.status.update', {
                incident_id: state.incidentId,
                new_status: 'RESOLVED',
                updated_by: 'simulation',
                note: `Vehicle ${vehicle.vehicleCode} reached scene in ${Math.round(arrivalSec / 60)} min`,
              });
              io?.to('admins').emit('incident:status_update', {
                incidentId: state.incidentId,
                status: 'RESOLVED',
                message: `${vehicle.vehicleCode} reached scene — incident closed`,
              });
            } catch (err) {
              logger.error('Failed to auto-resolve incident', { error: err });
            }
          }, 30000); // 30-second dwell time for demo
        }
      }
    }
  } catch (err) {
    logger.error('Arrival handling error', { vehicleId: state.vehicleId, error: err });
  } finally {
    stopSimulation(state.vehicleId);

    // Only trigger return trip if we just arrived at an incident
    if (!state.isReturnTrip) {
      setTimeout(async () => {
        try {
          const vehicle = await Vehicle.findById(state.vehicleId);
          if (vehicle && vehicle.status === 'ON_SCENE') {
            await startReturnSimulation(state.vehicleId);
          }
        } catch (err) {
          logger.error('Failed to auto-trigger return simulation', { vehicleId: state.vehicleId, error: err });
        }
      }, 45000); // Wait 45s before returning
    }
  }
}

// ─── Start Return to Base Simulation ──────────────────────────────────────────
export async function startReturnSimulation(vehicleId: string): Promise<void> {
  try {
    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) return;

    if (vehicle.homeLatitude === 0 || vehicle.homeLongitude === 0) {
      logger.warn('Vehicle has no home coordinates, skipping return simulation', { vehicleId });
      await Vehicle.findByIdAndUpdate(vehicleId, { status: 'AVAILABLE', currentIncidentId: null });
      return;
    }

    logger.info('Starting Return-to-Base simulation', { vehicleId, homeLat: vehicle.homeLatitude, homeLng: vehicle.homeLongitude });

    // Fetch route from current position back to station and densify
    const rawRoute = await fetchRoute(
      vehicle.currentLocation.latitude,
      vehicle.currentLocation.longitude,
      vehicle.homeLatitude,
      vehicle.homeLongitude
    );
    const route = densifyRoute(rawRoute, 0.03);

    await Vehicle.findByIdAndUpdate(vehicleId, {
      status: 'RETURNING',
      currentIncidentId: null
    });

    const state: SimulationState = {
      vehicleId,
      incidentId: null,
      route,
      currentIndex: 0,
      destLat: vehicle.homeLatitude,
      destLng: vehicle.homeLongitude,
      speedKmh: 40, // standard return speed
      multiplier: globalMultiplier,
      blocked: false,
      timer: null,
      arrivedNotified: false,
      inProgressNotified: false,
      isReturnTrip: true,
      totalDistanceKm: 0,
      dispatchedAt: Date.now(), // not used for return trips but required by the interface
    };

    // Keep the previous distance if we want total mission distance
    const currentState = activeSimulations.get(vehicleId);
    if (currentState) {
      state.totalDistanceKm = currentState.totalDistanceKm;
    }

    activeSimulations.set(vehicleId, state);

    // ─── 4. Immediate status broadcast ───────────────────────────────────────
    // This solves the visibility gap where the car takes seconds to appear
    if (io) {
      const initialPayload = {
        vehicleId:   vehicleId,
        vehicleCode: vehicle.vehicleCode,
        type:        vehicle.type,
        driverName:  vehicle.driverName || 'System Simulation',
        latitude:    vehicle.currentLocation.latitude,
        longitude:   vehicle.currentLocation.longitude,
        speedKmh:    0,
        heading:     vehicle.heading || 'N',
        batteryPct:  vehicle.batteryPct ?? 85,
        status:      vehicle.status,
        incidentId:  null,
        timestamp:   new Date().toISOString(),
      };
      // Broadcast to multiple rooms as fail-safe
      io.to('all-vehicles').emit(SOCKET_EVENTS.LOCATION_UPDATE, initialPayload);
      io.to('admins').emit(SOCKET_EVENTS.LOCATION_UPDATE, initialPayload);
      io.to(`vehicle:${vehicleId}`).emit(SOCKET_EVENTS.LOCATION_UPDATE, initialPayload);
      
      logger.debug('Emitted immediate return-to-base ping', { vehicleId });
    }

    scheduleNextStep(state);

    if (io) {
      io.to(`vehicle:${vehicleId}`).emit('simulation:status', { status: 'RETURNING', message: 'Returning to station' });
    }
  } catch (err) {
    logger.error('Failed to start return simulation', { vehicleId, error: err });
  }
}

// ─── Compass heading from two coordinates ────────────────────────────────────
function getHeading(lat1: number, lng1: number, lat2: number, lng2: number): string {
  const dLng = lng2 - lng1;
  const dLat = lat2 - lat1;
  const angle = (Math.atan2(dLng, dLat) * 180) / Math.PI;
  const norm = (angle + 360) % 360;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(norm / 45) % 8];
}

// ─── Get all active simulations (for status endpoint) ────────────────────────
export function getActiveSimulations(): string[] {
  return Array.from(activeSimulations.keys());
}
