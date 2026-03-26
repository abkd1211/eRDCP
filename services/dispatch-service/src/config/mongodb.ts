import mongoose from 'mongoose';
import { env } from './env';
import logger from './logger';

export const connectMongoDB = async (): Promise<void> => {
  try {
    mongoose.set('strictQuery', true);
    await mongoose.connect(env.MONGODB_URI);
    logger.info('MongoDB connected', { uri: env.MONGODB_URI.split('@')[1] });
  } catch (err) {
    logger.error('MongoDB connection failed', { error: err });
    process.exit(1);
  }
};

export const disconnectMongoDB = async (): Promise<void> => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
};

mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
mongoose.connection.on('reconnected',  () => logger.info('MongoDB reconnected'));
mongoose.connection.on('error',   (err) => logger.error('MongoDB error', { error: err.message }));
