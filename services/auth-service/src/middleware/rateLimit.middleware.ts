import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { sendError } from '../utils/response';
import { Request, Response } from 'express';

// ─── General API Rate Limiter ─────────────────────────────────────────────────
export const generalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max:      env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req: Request, res: Response) => {
    sendError(res, 429, 'Too many requests. Please try again later.', undefined, 'RATE_LIMIT_EXCEEDED');
  },
});

// ─── Strict Auth Rate Limiter (login / register) ──────────────────────────────
// Tighter limit to prevent brute-force attacks
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max:      env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req: Request, res: Response) => {
    sendError(res, 429, 'Too many authentication attempts. Please try again later.', undefined, 'AUTH_RATE_LIMIT_EXCEEDED');
  },
});
