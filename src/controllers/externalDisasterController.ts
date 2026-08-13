import type { RequestHandler } from 'express';
import { getExternalDisasterFeed } from '../services/externalDisasterService.js';

export const getExternalDisasters: RequestHandler = async (_req, res, next) => {
  try {
    const feed = await getExternalDisasterFeed();
    res.json({ success: true, data: feed });
  } catch (error) {
    next(error);
  }
};
