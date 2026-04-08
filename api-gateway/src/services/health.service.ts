import axios from 'axios';
import { SERVICES, ServiceKey } from '../config/env';
import { getAllCircuitStatuses } from './circuitBreaker.service';
import logger from '../config/logger';

export interface ServiceHealth {
  name:        string;
  status:      'healthy' | 'degraded' | 'down';
  responseMs:  number | null;
  circuit:     'CLOSED' | 'OPEN' | 'HALF_OPEN';
  url:         string;
  checkedAt:   string;
}

export interface AggregatedHealth {
  gateway:    'healthy' | 'degraded' | 'down';
  services:   Record<string, ServiceHealth>;
  upCount:    number;
  totalCount: number;
  checkedAt:  string;
}

// Cold-start timeout: Render free-tier services can take 30-60s to wake up.
// We use a generous timeout so a waking service isn't immediately flagged as down.
const HEALTH_CHECK_TIMEOUT_MS = 25_000;

export const checkAllServices = async (): Promise<AggregatedHealth> => {
  const circuits  = await getAllCircuitStatuses();
  const results:  Record<string, ServiceHealth> = {};
  const checks    = Object.entries(SERVICES).map(async ([key, svc]) => {
    const start = Date.now();
    try {
      await axios.get(`${svc.url}/health`, { timeout: HEALTH_CHECK_TIMEOUT_MS });
      const responseMs = Date.now() - start;
      results[key] = {
        name:       svc.name,
        // Mark as degraded if response took >5s (waking up but alive)
        status:     responseMs > 5000 ? 'degraded' : 'healthy',
        responseMs,
        circuit:    circuits[key]?.state ?? 'CLOSED',
        url:        svc.url,
        checkedAt:  new Date().toISOString(),
      };
    } catch {
      results[key] = {
        name:       svc.name,
        status:     'down',
        responseMs: null,
        circuit:    circuits[key]?.state ?? 'CLOSED',
        url:        svc.url,
        checkedAt:  new Date().toISOString(),
      };
      logger.warn(`Health check failed for ${svc.name}`);
    }
  });

  await Promise.all(checks);

  // Count both 'healthy' and 'degraded' (waking) as alive — only 'down' means offline
  const aliveCount  = Object.values(results).filter(s => s.status !== 'down').length;
  const healthyCount = Object.values(results).filter(s => s.status === 'healthy').length;
  const totalCount  = Object.keys(SERVICES).length;

  const gatewayStatus =
    healthyCount === totalCount ? 'healthy' :
    aliveCount === 0            ? 'down'    : 'degraded';

  return {
    gateway:    gatewayStatus,
    services:   results,
    upCount:    aliveCount,
    totalCount,
    checkedAt:  new Date().toISOString(),
  };
};
