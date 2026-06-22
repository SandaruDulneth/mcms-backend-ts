import mongoose from 'mongoose';
import { env } from './env.js';
import logger from './logger.js';

let monitoringRegistered = false;
let isClosing = false;

const connectDB = async (): Promise<void> => {
  const connection = await mongoose.connect(env.mongodbUri);

  if (!monitoringRegistered) {
    mongoose.connection.on('error', (error: Error) => {
      logger.error('MongoDB connection error', { error });
    });

    mongoose.connection.on('disconnected', () => {
      if (!isClosing) logger.warn('MongoDB disconnected unexpectedly');
    });

    monitoringRegistered = true;
  }

  logger.info('MongoDB connected', {
    host: connection.connection.host,
    database: connection.connection.name,
  });
};

export const disconnectDB = async (): Promise<void> => {
  isClosing = true;
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
};

export default connectDB;
