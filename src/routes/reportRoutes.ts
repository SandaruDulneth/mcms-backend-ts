import { Router } from 'express';
import { createReport, getReports } from '../controllers/reportController.js';
import {
  deleteReport,
  updateReportStatus,
  updateResponderStatus,
} from '../controllers/adminController.js';
import { validate } from '../middleware/validate.js';
import { createReportSchema } from '../validations/reportValidation.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const reportRouter = Router();

// Public citizen operations
reportRouter.route('/').get(getReports).post(validate(createReportSchema), createReport);

// Protected admin management operations
reportRouter.patch('/:id/status', requireAdmin, updateReportStatus);
reportRouter.delete('/:id', requireAdmin, deleteReport);
reportRouter.patch('/:id/responders/:responderId/status', requireAdmin, updateResponderStatus);

export default reportRouter;
