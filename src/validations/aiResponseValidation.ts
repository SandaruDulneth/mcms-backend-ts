import { z } from 'zod';
import { AppError } from '../errors/app-error.js';

const scoreMapSchema = z.record(z.string(), z.number());
const topPredictionSchema = z.tuple([z.string(), z.number()]);

export const fullPredictionResponseSchema = z.object({
  input_text: z.string(),
  crisis_type: z.object({
    crisis_type: z.string(),
    confidence: z.number(),
    top_3: z.array(topPredictionSchema),
    all_scores: scoreMapSchema,
  }),
  message_type: z.object({
    message_type: z.string(),
    confidence: z.number(),
    top_3: z.array(topPredictionSchema),
    all_scores: scoreMapSchema,
  }),
  urgency: z.object({
    urgency_level: z.string(),
    emoji: z.string().optional(),
    confidence: z.number(),
    all_scores: scoreMapSchema,
  }),
  latency_ms: z.number(),
  summary: z.string(),
});

export type FullPredictionResponse = z.infer<typeof fullPredictionResponseSchema>;

export function parseFullPredictionResponse(value: unknown): FullPredictionResponse {
  const result = fullPredictionResponseSchema.safeParse(value);

  if (!result.success) {
    throw new AppError('AI service returned an invalid response', 502, 'INVALID_AI_RESPONSE', {
      issues: result.error.issues,
    });
  }

  return result.data;
}
