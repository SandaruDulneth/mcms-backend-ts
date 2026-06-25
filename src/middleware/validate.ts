import type { RequestHandler } from 'express';
import type { ZodSchema } from 'zod';
import { AppError } from '../errors/app-error.js';

type RequestPart = 'body' | 'query' | 'params';

export function validate(schema: ZodSchema, requestPart: RequestPart = 'body'): RequestHandler {
  return (req, _res, next) => {
    const result = schema.safeParse(req[requestPart]);

    if (!result.success) {
      const [firstIssue] = result.error.issues;
      const issuePath = firstIssue?.path.length ? firstIssue.path.join('.') : requestPart;
      const issueMessage = firstIssue?.message ?? 'Validation failed';

      next(
        new AppError(`Invalid request data: ${issuePath} - ${issueMessage}`, 400, 'VALIDATION_ERROR', {
          issues: result.error.issues,
        }),
      );
      return;
    }

    req[requestPart] = result.data;
    next();
  };
}
