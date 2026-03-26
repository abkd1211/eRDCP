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
  dashboard:          ()               => 'analytics:dashboard',
  responseTimes:      (period: string) => `analytics:response-times:${period}`,
  incidentsByRegion:  (period: string) => `analytics:incidents-by-region:${period}`,
  resourceUtil:       ()               => 'analytics:resource-utilization',
  peakHours:          ()               => 'analytics:peak-hours',
  topResponders:      ()               => 'analytics:top-responders',
  slaReport:          ()               => 'analytics:sla',
  heatmap:            ()               => 'analytics:heatmap',
};

export const REDIS_TTL = {
  dashboard:    env.DASHBOARD_CACHE_TTL,
  standard:     120,   // 2 minutes for most analytics
  slow:         300,   // 5 minutes for expensive aggregations
};

export default redisClient;
