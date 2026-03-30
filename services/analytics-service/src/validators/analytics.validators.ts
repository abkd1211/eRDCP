import { z } from 'zod';

// Helper to handle Express query params that might be parsed as arrays
const ensureString = (val: unknown): string | undefined => {
  if (Array.isArray(val)) val = val[0];
  if (val === undefined || val === null || val === '') return undefined;
  return String(val);
};

const periodEnum = z.enum(['today', 'week', 'month', 'year']).default('week');

export const periodQuerySchema = z.object({
  query: z.object({
    period: z.preprocess(ensureString, periodEnum.optional()),
  }),
});

export const topRespondersSchema = z.object({
  query: z.object({
    limit: z.preprocess(ensureString, z.string().optional().transform(v => Math.min(parseInt(v ?? '10'), 50))),
  }),
});
