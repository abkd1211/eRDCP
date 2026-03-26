import app                                     from './app';
import { env }                                 from './config/env';
import logger                                  from './config/logger';
import { connectMongoDB, disconnectMongoDB }   from './config/mongodb';
import { connectRedis, disconnectRedis }       from './config/redis';
import { connectRabbitMQ, disconnectRabbitMQ } from './config/rabbitmq';
import { isWhisperAvailable }                  from './utils/whisper';

const bootstrap = async (): Promise<void> => {
  try {
    await connectMongoDB();
    await connectRedis();
    await connectRabbitMQ();

    // Check Whisper on startup — warn if not running but don't crash
    const whisperUp = await isWhisperAvailable();
    if (whisperUp) {
      logger.info('Whisper STT API is available', { url: env.WHISPER_API_URL });
    } else {
      logger.warn('⚠️  Whisper STT API is NOT running — using simulated transcripts', {
        url:  env.WHISPER_API_URL,
        hint: 'Run: docker run -p 9000:9000 onerahmet/openai-whisper-asr-webservice:latest-cpu',
      });
    }

    const server = app.listen(env.PORT, () => {
      logger.info('🤖 AI Call Agent Service running', {
        port:               env.PORT,
        environment:        env.NODE_ENV,
        docs:               `http://localhost:${env.PORT}/docs`,
        health:             `http://localhost:${env.PORT}/health`,
        whisper:            whisperUp ? 'online' : 'offline (simulated)',
        autoSubmitThreshold:`${env.AUTO_SUBMIT_CONFIDENCE_THRESHOLD * 100}%`,
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
    logger.error('Failed to start AI Agent Service', { error: err });
    process.exit(1);
  }
};

bootstrap();
