import type { Request, Response, NextFunction } from 'express';
import {
  addResponder,
  getRespondersByReport,
} from '../services/responderService.js';
import { createResponderSchema } from '../validations/responderValidation.js';
import { AppError } from '../errors/app-error.js';

export async function handleAddResponder(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reportId = req.params['reportId'] as string;
    const parsed = createResponderSchema.safeParse(req.body);

    if (!parsed.success) {
      throw new AppError('Invalid request data', 400, 'VALIDATION_ERROR', {
        issues: parsed.error.issues,
      });
    }

    // Pass fields individually to avoid spreading undefined optional fields
    const responder = await addResponder(reportId, {
      name        : parsed.data.name,
      responseType: parsed.data.responseType,
      message     : parsed.data.message,
      ...(parsed.data.organization ? { organization: parsed.data.organization } : {}),
      ...(parsed.data.contactInfo  ? { contactInfo : parsed.data.contactInfo  } : {}),
    });

    res.status(201).json({ success: true, data: responder });
  } catch (error) {
    next(error);
  }
}

export async function handleGetResponders(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const reportId = req.params['reportId'] as string;
    const responders = await getRespondersByReport(reportId);
    res.status(200).json({ success: true, data: responders });
  } catch (error) {
    next(error);
  }
}