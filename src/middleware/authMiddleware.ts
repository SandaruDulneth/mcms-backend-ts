import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../errors/app-error.js';

export interface AdminPayload {
  username: string;
  role: string;
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(
      new AppError('Authentication required. Please log in as an administrator.', 401, 'UNAUTHORIZED'),
    );
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return next(
      new AppError('Authentication token missing. Please log in as an administrator.', 401, 'UNAUTHORIZED'),
    );
  }

  if (!env.jwtSecret) {
    return next(
      new AppError('Server authentication is not configured properly.', 500, 'SERVER_ERROR'),
    );
  }

  try {
    const decoded = jwt.verify(token, env.jwtSecret) as AdminPayload;

    if (decoded.role !== 'admin' || decoded.username !== env.adminUsername) {
      return next(new AppError('Invalid authentication token credentials.', 401, 'UNAUTHORIZED'));
    }

    (req as unknown as { admin: AdminPayload }).admin = decoded;
    next();
  } catch (error: unknown) {
    const err = error as { name?: string };
    if (err.name === 'TokenExpiredError') {
      return next(
        new AppError('Session expired. Please log in again.', 401, 'TOKEN_EXPIRED'),
      );
    }
    return next(
      new AppError('Invalid or corrupted authentication token.', 401, 'UNAUTHORIZED'),
    );
  }
};
