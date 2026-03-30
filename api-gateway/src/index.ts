import app                             from './app';
import { env }                         from './config/env';
import logger                          from './config/logger';
import { connectRedis, disconnectRedis } from './config/redis';

const bootstrap = async (): Promise<void> => {
  try {
    await connectRedis();

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
