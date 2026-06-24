import { z } from 'zod';

export const createReportSchema = z.object({
  message: z.string().trim().min(1, 'Report message is required'),
  location: z.string().trim().min(1).optional(),
  sourceType: z.enum(['User Report', 'News API']).optional(),
});

export type CreateReportBody = z.infer<typeof createReportSchema>;
