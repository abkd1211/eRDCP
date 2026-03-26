import app                                       from './app';
import { env }                                   from './config/env';
import logger                                    from './config/logger';
import { connectMongoDB, disconnectMongoDB }     from './config/mongodb';
import { connectRedis, disconnectRedis }         from './config/redis';
import { connectRabbitMQ, disconnectRabbitMQ }   from './config/rabbitmq';
import { startConsumers }                        from './services/consumer.service';

const bootstrap = async (): Promise<void> => {
  try {
    await connectMongoDB();
    await connectRedis();
    await connectRabbitMQ();
    await startConsumers();

    const server = app.listen(env.PORT, () => {
      logger.info('📊 Analytics Service running', {
        port:        env.PORT,
        environment: env.NODE_ENV,
        docs:        `http://localhost:${env.PORT}/docs`,
        health:      `http://localhost:${env.PORT}/health`,
        slaTarget:   `${env.SLA_TARGET_SEC}s (${env.SLA_TARGET_SEC / 60} min)`,
      });
    });

    const shutdown = async (signal: string): Promise<void> => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
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
    logger.error('Failed to start Analytics Service', { error: err });
    process.exit(1);
  }
};

bootstrap();
