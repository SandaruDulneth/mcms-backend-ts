import { Router } from 'express';
import { createReport, getReports } from '../controllers/reportController.js';
import { validate } from '../middleware/validate.js';
import { createReportSchema } from '../validations/reportValidation.js';

const reportRouter = Router();

reportRouter.route('/').get(getReports).post(validate(createReportSchema), createReport);

export default reportRouter;
