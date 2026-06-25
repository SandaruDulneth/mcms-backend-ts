import { z } from 'zod';
import { AppError } from '../errors/app-error.js';

const scoreMapSchema = z.record(z.string(), z.number());
const topPredictionSchema = z.tuple([z.string(), z.number()]);
const locationItemSchema = z.object({
  text: z.string(),
  label: z.string(),
  start: z.number(),
  end: z.number(),
  source: z.string(),
});

const communityItemSchema = z.object({
  community: z.string(),
  matched_text: z.string(),
});

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
  location_extraction: z.object({
    locations: z.array(locationItemSchema),
    location_count: z.number(),
    has_location: z.boolean(),
  }).optional(),

   community_extraction: z.object({
    affected_communities: z.array(communityItemSchema),
    community_count: z.number(),
    has_community: z.boolean(),
  }).optional(),

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
