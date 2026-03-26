import app from './app';
import { env } from './config/env';
import logger from './config/logger';
import prisma from './config/prisma';
import { connectRedis, disconnectRedis } from './config/redis';

const bootstrap = async (): Promise<void> => {
  try {
    // ─── Connect to PostgreSQL via Prisma ─────────────────────────────────────
    await prisma.$connect();
    logger.info('PostgreSQL connected');

    // ─── Connect to Redis ─────────────────────────────────────────────────────
    await connectRedis();

    // ─── Start HTTP Server ────────────────────────────────────────────────────
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 Auth Service running`, {
        port:        env.PORT,
        environment: env.NODE_ENV,
        docs:        `http://localhost:${env.PORT}/docs`,
        health:      `http://localhost:${env.PORT}/health`,
      });
    });

    // ─── Graceful Shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received — shutting down gracefully`);

      server.close(async () => {
        logger.info('HTTP server closed');
        await prisma.$disconnect();
        logger.info('PostgreSQL disconnected');
        await disconnectRedis();
        logger.info('Redis disconnected');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    // ─── Unhandled Rejection / Exception ─────────────────────────────────────
    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Promise Rejection', { reason });
    });

    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });

  } catch (err) {
    logger.error('Failed to start Auth Service', { error: err });
    process.exit(1);
  }
};

bootstrap();
