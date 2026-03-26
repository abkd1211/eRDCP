import { z } from 'zod';

const periodEnum = z.enum(['today', 'week', 'month', 'year']).default('week');

export const periodQuerySchema = z.object({
  query: z.object({
    period: periodEnum.optional(),
  }),
});

export const topRespondersSchema = z.object({
  query: z.object({
    limit: z.string().optional().transform(v => Math.min(parseInt(v ?? '10'), 50)),
  }),
});
