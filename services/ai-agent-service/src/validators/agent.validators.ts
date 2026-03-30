import { z } from 'zod';

export const ingestCallSchema = z.object({
  body: z.object({
    callerPhone: z
      .string()
      .regex(/^\+?[0-9\s\-]{7,15}$/, 'Invalid phone number format')
      .optional(),
  }),
});

export const reviewSessionSchema = z.object({
  params: z.object({
    id: z.string().min(1, 'Session ID is required'),
  }),
  body: z.object({
    corrections: z.record(z.string()).optional().default({}),
  }),
});

// Helper to handle Express query params that might be parsed as arrays
const ensureString = (val: unknown): string | undefined => {
  if (Array.isArray(val)) val = val[0];
  if (val === undefined || val === null || val === '') return undefined;
  return String(val);
};

export const listSessionsSchema = z.object({
  query: z.object({
    page:  z.preprocess(ensureString, z.string().optional().transform(v => parseInt(v ?? '1'))),
    limit: z.preprocess(ensureString, z.string().optional().transform(v => Math.min(parseInt(v ?? '20'), 100))),
  }),
});
