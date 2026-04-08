import app                             from './app';
import { env }                         from './config/env';
import { SERVICES }                    from './config/env';
import logger                          from './config/logger';
import { connectRedis, disconnectRedis } from './config/redis';
import { clearAllCircuitsOnStartup }   from './services/circuitBreaker.service';
import axios                           from 'axios';

const bootstrap = async (): Promise<void> => {
  try {
    await connectRedis();

    // Clear any stale OPEN circuit states from previous cold-start death spirals.
    // This runs BEFORE the server starts accepting traffic.
    await clearAllCircuitsOnStartup();

    logger.info('Environment Check', {
      jwtSecretLength: env.JWT_ACCESS_SECRET.length,
      jwtSecretPrefix: env.JWT_ACCESS_SECRET.slice(0, 4),
      internalSecretLength: env.INTERNAL_SERVICE_SECRET.length,
      redisUrlHost: new URL(env.REDIS_URL).host
    });

    const server = app.listen(env.PORT, () => {
      logger.info('🚀 API Gateway running', {
        port:        env.PORT,
        environment: env.NODE_ENV,
        health:      `http://localhost:${env.PORT}/health`,
        allHealth:   `http://localhost:${env.PORT}/health/all`,
        note:        'Socket.io connects directly to dispatch-service:3003',
      });

      // ── Background warm-up probe ─────────────────────────────────────────────
      // Fire-and-forget: ping all downstream services 5s after gateway starts.
      // This kicks off their Render cold-start so they're ready for real traffic.
      // Does NOT block startup or fail the gateway if services don't respond.
      setTimeout(() => {
        logger.info('Warm-up probe: pinging all downstream services...');
        Object.entries(SERVICES).forEach(([key, svc]) => {
          axios.get(`${svc.url}/health`, { timeout: 60_000 })
            .then(() => logger.info(`Warm-up OK: ${svc.name}`))
            .catch((err) => logger.warn(`Warm-up ping failed for ${svc.name}`, {
              error: err.message,
              note: 'Service may be cold-starting — this is expected.',
            }));
        });
      }, 5_000);
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received — shutting down gateway`);
      server.close(async () => {
        await disconnectRedis();
        logger.info('Gateway shutdown complete');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) =>
      logger.error('Unhandled rejection', { reason })
    );
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });

  } catch (err) {
    logger.error('Failed to start API Gateway', { error: err });
    process.exit(1);
  }
};

bootstrap();
