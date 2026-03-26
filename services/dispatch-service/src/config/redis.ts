import { createClient } from 'redis';
import { env } from './env';
import logger from './logger';

const redisClient = createClient({ url: env.REDIS_URL });

redisClient.on('connect',      () => logger.info('Redis connected'));
redisClient.on('error',    (err) => logger.error('Redis error', { error: err.message }));
redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

export const connectRedis    = async () => { await redisClient.connect(); };
export const disconnectRedis = async () => { await redisClient.disconnect(); };

// ─── Key helpers ──────────────────────────────────────────────────────────────
export const REDIS_KEYS = {
  vehicleLocation:    (vehicleId: string) => `vehicle:location:${vehicleId}`,
  vehicleHeartbeat:   (vehicleId: string) => `vehicle:heartbeat:${vehicleId}`,
  activeVehicles:     ()                  => `vehicles:active`,
  incidentVehicles:   (incidentId: string)=> `incident:vehicles:${incidentId}`,
  vehicleEta:         (vehicleId: string) => `vehicle:eta:${vehicleId}`,
  blacklistedToken:   (jti: string)       => `blacklist:${jti}`,
};

export const REDIS_TTL = {
  vehicleLocation:  30,          // 30s — location is fresh for 30 seconds
  vehicleHeartbeat: 150,         // 2.5 minutes — slightly above heartbeat timeout
  activeVehicles:   10,          // 10s cache
  vehicleEta:       60,          // 1 min
};

export default redisClient;
