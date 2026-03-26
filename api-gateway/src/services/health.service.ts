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

export const checkAllServices = async (): Promise<AggregatedHealth> => {
  const circuits  = await getAllCircuitStatuses();
  const results:  Record<string, ServiceHealth> = {};
  const checks    = Object.entries(SERVICES).map(async ([key, svc]) => {
    const start = Date.now();
    try {
      await axios.get(`${svc.url}/health`, { timeout: 5000 });
      results[key] = {
        name:       svc.name,
        status:     'healthy',
        responseMs: Date.now() - start,
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

  const upCount    = Object.values(results).filter(s => s.status === 'healthy').length;
  const totalCount = Object.keys(SERVICES).length;

  const gatewayStatus =
    upCount === totalCount ? 'healthy' :
    upCount === 0          ? 'down'    : 'degraded';

  return {
    gateway:    gatewayStatus,
    services:   results,
    upCount,
    totalCount,
    checkedAt:  new Date().toISOString(),
  };
};
