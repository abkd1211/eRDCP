import { createClient } from 'redis';
import { env } from './env';
import logger from './logger';

const redisClient = createClient({ url: env.REDIS_URL });

redisClient.on('connect',    () => logger.info('Redis connected'));
redisClient.on('ready',      () => logger.info('Redis ready'));
redisClient.on('error',  (err) => logger.error('Redis error', { error: err.message }));
redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));

export const connectRedis = async (): Promise<void> => {
  await redisClient.connect();
};

export const disconnectRedis = async (): Promise<void> => {
  await redisClient.disconnect();
};

// ─── Redis Key Helpers ────────────────────────────────────────────────────────
export const REDIS_KEYS = {
  blacklistedToken: (jti: string)       => `blacklist:${jti}`,
  userSession:      (userId: string)    => `session:${userId}`,
  userProfile:      (userId: string)    => `profile:${userId}`,
  rateLimit:        (ip: string)        => `ratelimit:${ip}`,
};

export const REDIS_TTL = {
  accessToken:   60 * 15,           // 15 minutes
  refreshToken:  60 * 60 * 24 * 7,  // 7 days
  userProfile:   60 * 5,            // 5 minutes
};

export default redisClient;
