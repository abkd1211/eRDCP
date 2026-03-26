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
  operatorOnline:   (userId: string) => `operator:online:${userId}`,
  onlineOperators:  ()               => `operators:online`,
  sessionProcessing:(sessionId: string) => `session:processing:${sessionId}`,
  agentStats:       ()               => `ai-agent:stats`,
};

export const REDIS_TTL = {
  operatorHeartbeat: 120,  // 2 minutes — operator must ping to stay "online"
  agentStats:        300,  // 5 minutes
};

export default redisClient;
