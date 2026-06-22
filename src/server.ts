import type { Server } from 'node:http';
import app from './app.js';
import connectDB, { disconnectDB } from './config/db.js';
import { env } from './config/env.js';
import logger from './config/logger.js';

let server: Server | undefined;
let shuttingDown = false;

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info('Graceful shutdown started', { signal });

  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
  }

  await disconnectDB();
  logger.info('Server stopped');
};

const start = async (): Promise<void> => {
  try {
    await connectDB();
    server = app.listen(env.port, () => {
      logger.info('Server started', { port: env.port, environment: env.nodeEnv });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exitCode = 1;
  }
};

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    void shutdown(signal)
      .catch((error) => {
        logger.error('Graceful shutdown failed', { error });
        process.exitCode = 1;
      })
      .finally(() => process.exit());
  });
}

process.on('unhandledRejection', (error) => {
  logger.error('Unhandled promise rejection', { error });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error });
  process.exit(1);
});

void start();
