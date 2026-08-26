import { Router } from 'express';
import {
  adminLogin,
  getAdminMe,
  getAdminStats,
  getAllReports,
  getAllResponders,
} from '../controllers/adminController.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const adminRouter = Router();

// Public authentication endpoint
adminRouter.post('/login', adminLogin);

// Protected admin-only endpoints
adminRouter.get('/me', requireAdmin, getAdminMe);
adminRouter.get('/stats', requireAdmin, getAdminStats);
adminRouter.get('/reports', requireAdmin, getAllReports);
adminRouter.get('/responders', requireAdmin, getAllResponders);

export default adminRouter;
