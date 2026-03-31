import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { sendError } from '../utils/response';
import { Request, Response } from 'express';

export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max:      env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req: Request, res: Response) =>
    sendError(res, 429, 'Too many requests. Please try again later.', undefined, 'RATE_LIMIT_EXCEEDED'),
  skip: (req) => req.method === 'OPTIONS',
});
