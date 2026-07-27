import { Router } from 'express';
import { createReport, getReports } from '../controllers/reportController.js';
import {
  deleteReport,
  updateReportStatus,
  updateResponderStatus,
} from '../controllers/adminController.js';
import { validate } from '../middleware/validate.js';
import { createReportSchema } from '../validations/reportValidation.js';

const reportRouter = Router();

reportRouter.route('/').get(getReports).post(validate(createReportSchema), createReport);

// Admin operations on individual reports
reportRouter.patch('/:id/status', updateReportStatus);
reportRouter.delete('/:id', deleteReport);
reportRouter.patch('/:id/responders/:responderId/status', updateResponderStatus);

export default reportRouter;
