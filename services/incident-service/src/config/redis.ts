import { createClient } from 'redis';
import { env } from './env';
import logger from './logger';

const redisClient = createClient({ url: env.REDIS_URL });

redisClient.on('connect',      () => logger.info('Redis connected'));
redisClient.on('error',    (err) => logger.error('Redis error', { error: err.message }));
redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

export const connectRedis    = async () => { await redisClient.connect(); };
export const disconnectRedis = async () => { await redisClient.disconnect(); };

export const REDIS_KEYS = {
  openIncidents:         ()                => `incidents:open`,
  incident:              (id: string)      => `incident:${id}`,
  responders:            (type: string)    => `responders:${type}`,
  nearestResponder:      (lat: number, lng: number, type: string) => `nearest:${type}:${lat.toFixed(3)}:${lng.toFixed(3)}`,
};

export const REDIS_TTL = {
  incident:          60 * 2,   // 2 minutes
  responderList:     60 * 1,   // 1 minute (availability changes frequently)
  nearestResponder:  30,        // 30 seconds
};

export default redisClient;
