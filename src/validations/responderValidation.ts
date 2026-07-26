import { z } from 'zod';

export const createResponderSchema = z.object({
  name        : z.string().min(1, 'Name is required').max(100),
  organization: z.string().max(100).optional(),
  responseType: z.enum([
    'rescue', 'medical', 'food_water', 'shelter',
    'transport', 'donation', 'information', 'other',
  ]),
  message    : z.string().min(1, 'Message is required').max(1000),
  contactInfo: z.string().max(200).optional(),
});

export type CreateResponderInput = z.infer<typeof createResponderSchema>;
