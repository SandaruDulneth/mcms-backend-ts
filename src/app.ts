import cors from 'cors';
import express from 'express';
import mongoose from 'mongoose';
import { env } from './config/env.js';
import logger from './config/logger.js';
import { errorHandler } from './errors/error-handler.js';
import { notFound } from './errors/not-found.js';

const app = express();

app.disable('x-powered-by');
app.use(cors({ origin: env.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  const startedAt = Date.now();

  res.on('finish', () => {
    logger.info('HTTP request completed', {
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
});

app.get('/api/health', (_req, res) => {
  const databaseConnected = mongoose.connection.readyState === 1;
  res.status(databaseConnected ? 200 : 503).json({
    success: databaseConnected,
    service: 'mcms-backend',
    database: databaseConnected ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString(),
  });
});

app.use(notFound);
app.use(errorHandler);

export default app;
