import app from './app';
import { env } from './config/env';
import logger from './config/logger';
import prisma from './config/prisma';
import { connectRedis, disconnectRedis } from './config/redis';
import { connectRabbitMQ, disconnectRabbitMQ } from './config/rabbitmq';
import { startConsumers } from './services/consumer.service';

const bootstrap = async (): Promise<void> => {
  try {
    // ─── PostgreSQL ───────────────────────────────────────────────────────────
    await prisma.$connect();
    logger.info('PostgreSQL connected');

    // ─── Redis ────────────────────────────────────────────────────────────────
    await connectRedis();

    // ─── RabbitMQ ─────────────────────────────────────────────────────────────
    await connectRabbitMQ();

    // ─── Start Consumers (listen for AI call events) ──────────────────────────
    await startConsumers();

    // ─── HTTP Server ──────────────────────────────────────────────────────────
    const server = app.listen(env.PORT, () => {
      logger.info('🚨 Incident Service running', {
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
        await disconnectRabbitMQ();
        await prisma.$disconnect();
        await disconnectRedis();
        logger.info('All connections closed');
        process.exit(0);
      });
      setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logger.error('Unhandled Promise Rejection', { reason });
    });
    process.on('uncaughtException', (err) => {
      logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
      process.exit(1);
    });

  } catch (err) {
    logger.error('Failed to start Incident Service', { error: err });
    process.exit(1);
  }
};

bootstrap();
