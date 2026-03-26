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
  blacklistedToken:  (jti: string)  => `blacklist:${jti}`,
  responseCache:     (key: string)  => `gateway:cache:${key}`,
  circuitBreaker:    (svc: string)  => `gateway:circuit:${svc}`,
  rateLimitUser:     (userId: string) => `gateway:ratelimit:user:${userId}`,
};

export default redisClient;
