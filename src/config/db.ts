import dns from 'node:dns';
import mongoose from 'mongoose';
import { env } from './env.js';
import logger from './logger.js';

// ---------------------------------------------------------------------------
// PERMANENT FIX: force Node's internal DNS resolver to use public resolvers
// that reliably support SRV lookups (needed for mongodb+srv:// URIs).
// This runs once at process start and applies to every DNS lookup Node makes
// afterward — so switching wifi/hotspot/networks never breaks this again.
// Must run before mongoose.connect() is called.
// ---------------------------------------------------------------------------
dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);

let monitoringRegistered = false;
let isClosing = false;

interface ConnectOptions {
  retries?: number;
  delayMs?: number;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async (options: ConnectOptions = {}): Promise<void> => {
  const { retries = 5, delayMs = 3000 } = options;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const connection = await mongoose.connect(env.mongodbUri, {
        serverSelectionTimeoutMS: 10000, // fail fast instead of hanging forever
        family: 4,                       // avoid IPv6 resolution quirks on mobile networks
      });

      if (!monitoringRegistered) {
        mongoose.connection.on('error', (error: Error) => {
          logger.error('MongoDB connection error', { error });
        });

        mongoose.connection.on('disconnected', () => {
          if (!isClosing) logger.warn('MongoDB disconnected unexpectedly');
        });

        mongoose.connection.on('reconnected', () => {
          logger.info('MongoDB reconnected');
        });

        monitoringRegistered = true;
      }

      logger.info('MongoDB connected', {
        database: connection.connection.name,
        attempt,
      });

      return;
    } catch (error) {
      logger.warn(`MongoDB connect attempt ${attempt}/${retries} failed`, { error });

      if (attempt === retries) {
        logger.error('MongoDB connection failed after all retries', { error });
        throw error;
      }

      await wait(delayMs);
    }
  }
};

export const disconnectDB = async (): Promise<void> => {
  isClosing = true;
  await mongoose.connection.close();
  logger.info('MongoDB connection closed');
};

export default connectDB;