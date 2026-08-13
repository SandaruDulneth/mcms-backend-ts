import { Router } from 'express';
import { getExternalDisasters } from '../controllers/externalDisasterController.js';

const externalDisasterRouter = Router();

externalDisasterRouter.get('/', getExternalDisasters);

export default externalDisasterRouter;
