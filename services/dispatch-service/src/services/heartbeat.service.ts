import dispatchService from '../services/dispatch.service';
import logger from '../config/logger';
import { env } from '../config/env';

let heartbeatInterval: NodeJS.Timeout | null = null;

// Runs every (HEARTBEAT_TIMEOUT_SEC / 2) seconds
export const startHeartbeatMonitor = (): void => {
  const intervalMs = (env.HEARTBEAT_TIMEOUT_SEC / 2) * 1000;

  heartbeatInterval = setInterval(async () => {
    try {
      await dispatchService.checkHeartbeats();
    } catch (err) {
      logger.error('Heartbeat monitor error', { error: err });
    }
  }, intervalMs);

  logger.info('Heartbeat monitor started', {
    intervalSec: env.HEARTBEAT_TIMEOUT_SEC / 2,
    timeoutSec:  env.HEARTBEAT_TIMEOUT_SEC,
  });
};

export const stopHeartbeatMonitor = (): void => {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
    logger.info('Heartbeat monitor stopped');
  }
};
