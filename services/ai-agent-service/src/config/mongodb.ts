import mongoose from 'mongoose';
import { env } from './env';
import logger from './logger';

export const connectMongoDB = async (): Promise<void> => {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.MONGODB_URI);
    logger.info('MongoDB connected');
  } catch (err) {
    logger.error('MongoDB connection failed — staying in degraded mode', { error: err });
    // Don't exit — allow the service to start and retry in background
  }
};

export const disconnectMongoDB = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error',   (err) => logger.error('MongoDB error', { error: err.message }));
