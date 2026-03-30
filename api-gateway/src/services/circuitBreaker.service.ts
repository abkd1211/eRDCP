import redisClient, { REDIS_KEYS } from '../config/redis';
import { env, ServiceKey, SERVICES } from '../config/env';
import logger from '../config/logger';

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitStatus {
  state:       CircuitState;
  failures:    number;
  lastFailure: string | null;
  openedAt:    string | null;
}

// ─── Record a failure for a service ──────────────────────────────────────────
export const recordFailure = async (service: ServiceKey): Promise<void> => {
  const key    = REDIS_KEYS.circuitBreaker(service);
  let stored: string | null = null;
  try {
    stored = await redisClient.get(key);
  } catch (err) {
    logger.warn('Redis unreachable in recordFailure', { service, error: (err as Error).message });
  }

  const status: CircuitStatus = stored
    ? JSON.parse(stored)
    : { state: 'CLOSED', failures: 0, lastFailure: null, openedAt: null };

  status.failures++;
  status.lastFailure = new Date().toISOString();

  if (status.failures >= env.CIRCUIT_BREAKER_THRESHOLD) {
    status.state    = 'OPEN';
    status.openedAt = new Date().toISOString();
    logger.error(`Circuit OPEN for ${service}`, { failures: status.failures });
  }

  try {
    await redisClient.setEx(key, env.CIRCUIT_BREAKER_RESET_SEC * 10, JSON.stringify(status));
  } catch (err) {
    // If Redis is down, we just can't track failures persistently
  }
};

// ─── Record a success — reset failure count ───────────────────────────────────
export const recordSuccess = async (service: ServiceKey): Promise<void> => {
  const key    = REDIS_KEYS.circuitBreaker(service);
  let stored: string | null = null;
  try {
    stored = await redisClient.get(key);
  } catch { return; }
  if (!stored) return;

  const status: CircuitStatus = JSON.parse(stored);
  if (status.failures > 0) {
    status.failures = 0;
    status.state    = 'CLOSED';
    status.openedAt = null;
    try {
      await redisClient.setEx(key, env.CIRCUIT_BREAKER_RESET_SEC * 10, JSON.stringify(status));
      logger.info(`Circuit CLOSED for ${service}`);
    } catch { /* Ignore */ }
  }
};

// ─── Check if a service is available ─────────────────────────────────────────
export const isServiceAvailable = async (service: ServiceKey): Promise<boolean> => {
  const key    = REDIS_KEYS.circuitBreaker(service);
  let stored: string | null = null;
  try {
    stored = await redisClient.get(key);
  } catch (err) {
    // If Redis is down, we assume services are available to avoid platform-wide crash
    return true; 
  }
  if (!stored) return true; // No failures recorded — assume available

  const status: CircuitStatus = JSON.parse(stored);
  if (status.state === 'CLOSED') return true;

  if (status.state === 'OPEN') {
    // Check if reset period has elapsed — allow one probe (HALF_OPEN)
    const openedAt  = new Date(status.openedAt!).getTime();
    const resetMs   = env.CIRCUIT_BREAKER_RESET_SEC * 1000;
    if (Date.now() - openedAt > resetMs) {
      status.state = 'HALF_OPEN';
      try {
        await redisClient.setEx(key, env.CIRCUIT_BREAKER_RESET_SEC * 10, JSON.stringify(status));
      } catch { /* Ignore */ }
      logger.info(`Circuit HALF_OPEN for ${service} — probing`);
      return true; // Allow one request through
    }
    return false; // Still open
  }

  return true; // HALF_OPEN — allow through
};

// ─── Get all circuit statuses ─────────────────────────────────────────────────
export const getAllCircuitStatuses = async (): Promise<Record<string, CircuitStatus & { serviceName: string }>> => {
  const result: Record<string, CircuitStatus & { serviceName: string }> = {};

  for (const [key, svc] of Object.entries(SERVICES)) {
    const stored = await redisClient.get(REDIS_KEYS.circuitBreaker(key as ServiceKey));
    result[key] = stored
      ? { ...JSON.parse(stored), serviceName: svc.name }
      : { state: 'CLOSED', failures: 0, lastFailure: null, openedAt: null, serviceName: svc.name };
  }

  return result;
};
