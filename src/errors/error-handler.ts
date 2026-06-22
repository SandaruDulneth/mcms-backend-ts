import type { ErrorRequestHandler } from 'express';
import { env } from '../config/env.js';
import logger from '../config/logger.js';
import { AppError } from './app-error.js';

export const errorHandler: ErrorRequestHandler = (error: unknown, req, res, _next) => {
  const isOperational = error instanceof AppError;
  const statusCode = isOperational ? error.statusCode : 500;
  const message = isOperational ? error.message : 'Internal server error';

  logger.error(message, {
    error,
    method: req.method,
    path: req.originalUrl,
    statusCode,
  });

  res.status(statusCode).json({
    success: false,
    error: {
      code: isOperational ? error.code : 'INTERNAL_SERVER_ERROR',
      message,
      ...(isOperational && error.details !== undefined ? { details: error.details } : {}),
      ...(env.nodeEnv === 'development' && error instanceof Error
        ? { stack: error.stack }
        : {}),
    },
  });
};
