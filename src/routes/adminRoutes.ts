import { Router } from 'express';
import { getAdminStats, getAllResponders } from '../controllers/adminController.js';

const adminRouter = Router();

adminRouter.get('/stats', getAdminStats);
adminRouter.get('/responders', getAllResponders);

export default adminRouter;
