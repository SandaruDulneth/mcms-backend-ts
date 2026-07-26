import { Router } from 'express';
import {
  handleAddResponder,
  handleGetResponders,
} from '../controllers/responderController.js';

const router = Router({ mergeParams: true });

// POST /api/reports/:reportId/responders
router.post('/', handleAddResponder);

// GET  /api/reports/:reportId/responders
router.get('/', handleGetResponders);

export default router;
