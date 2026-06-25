import type { RequestHandler } from 'express';
import { createUserReport, getUserReports } from '../services/reportService.js';
import type { CreateReportBody } from '../validations/reportValidation.js';

export const createReport: RequestHandler = async (req, res, next) => {
  try {
    const payload = req.body as CreateReportBody;
    const report = await createUserReport(payload);

    res.status(201).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

export const getReports: RequestHandler = async (_req, res, next) => {
  try {
    const reports = await getUserReports();

    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    next(error);
  }
};
