import { Router } from 'express';
import { getAdminStats, getAllReports, getAllResponders } from '../controllers/adminController.js';

const adminRouter = Router();

adminRouter.get('/stats', getAdminStats);
adminRouter.get('/reports', getAllReports);
adminRouter.get('/responders', getAllResponders);

export default adminRouter;
