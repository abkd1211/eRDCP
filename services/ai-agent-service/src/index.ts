import app                                     from './app';
import { env }                                 from './config/env';
import logger                                  from './config/logger';
import { connectMongoDB, disconnectMongoDB }   from './config/mongodb';
import { connectRedis, disconnectRedis }       from './config/redis';
import { connectRabbitMQ, disconnectRabbitMQ } from './config/rabbitmq';
import { isWhisperAvailable }                  from './utils/whisper';

const bootstrap = async (): Promise<void> => {
  const whisperStatus = { available: false };

  // ─── Phase 1: Immediate Listen ──────────────────────────────────────────────
  // We start the server first so the Gateway finds it reachable and stays 'Closed'
  const server = app.listen(env.PORT, () => {
    logger.info('🤖 AI Call Agent Service listening', {
      port:               env.PORT,
      status:             'Awaiting Dependency Stimuli...',
      health:             `http://localhost:${env.PORT}/health`,
    });
  });

  // ─── Phase 2: Parallel Dependency Connections ───────────────────────────────
  const initDependencies = async () => {
    // MongoDB
    connectMongoDB()
      .then(() => logger.info('MongoDB established'))
      .catch((err) => logger.error('MongoDB init failed', { error: err.message }));
    
    // Redis
    connectRedis()
      .then(() => logger.info('Redis established'))
      .catch((err) => logger.error('Redis init failed', { error: err.message }));

    // RabbitMQ
    connectRabbitMQ()
      .then(() => logger.info('RabbitMQ established'))
      .catch((err) => logger.error('RabbitMQ init failed', { error: err.message }));

    // Whisper
    isWhisperAvailable().then(up => {
      whisperStatus.available = up;
      if (up) logger.info('Whisper STT connected');
      else logger.warn('Whisper STT simulated');
    });
  };

  initDependencies();

  // ─── Graceful Shutdown ──────────────────────────────────────────────────────
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`${signal} received — shutting down gracefully`);
    server.close(async () => {
      await disconnectRabbitMQ().catch(() => {});
      await disconnectMongoDB().catch(() => {});
      await disconnectRedis().catch(() => {});
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
    // Don't exit immediately on uncaught exceptions if we want to stay "listening"
    // but log it heavily for debugging.
  });
};

bootstrap();
