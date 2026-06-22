import type { RequestHandler } from 'express';
import { AppError } from './app-error.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.originalUrl} was not found`, 404, 'ROUTE_NOT_FOUND'));
};
