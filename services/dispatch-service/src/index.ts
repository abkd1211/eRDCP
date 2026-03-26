import { httpServer }              from './app';
import { env }                    from './config/env';
import logger                     from './config/logger';
import { connectMongoDB, disconnectMongoDB } from './config/mongodb';
import { connectRedis, disconnectRedis }     from './config/redis';
import { connectRabbitMQ, disconnectRabbitMQ } from './config/rabbitmq';
import { startConsumers }         from './services/consumer.service';
import { startHeartbeatMonitor, stopHeartbeatMonitor } from './services/heartbeat.service';

const bootstrap = async (): Promise<void> => {
  try {
    // ─── Connections ──────────────────────────────────────────────────────────
    await connectMongoDB();
    await connectRedis();
    await connectRabbitMQ();

    // ─── Start RabbitMQ consumers ─────────────────────────────────────────────
    await startConsumers();

    // ─── Start heartbeat monitor ──────────────────────────────────────────────
    startHeartbeatMonitor();

    // ─── Start HTTP + Socket.io server ────────────────────────────────────────
    httpServer.listen(env.PORT, () => {
      logger.info('🚗 Dispatch Tracking Service running', {
        port:        env.PORT,
        environment: env.NODE_ENV,
        docs:        `http://localhost:${env.PORT}/docs`,
        health:      `http://localhost:${env.PORT}/health`,
        websocket:   `ws://localhost:${env.PORT}`,
      });
    });

    // ─── Graceful Shutdown ────────────────────────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received — shutting down gracefully`);
      httpServer.close(async () => {
        stopHeartbeatMonitor();
        await disconnectRabbitMQ();
        await disconnectMongoDB();
        await disconnectRedis();
        logger.info('All connections closed');
        process.exit(0);
      });
      setTimeout(() => { logger.error('Forced shutdown'); process.exit(1); }, 10_000);
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
    logger.error('Failed to start Dispatch Service', { error: err });
    process.exit(1);
  }
};

bootstrap();
