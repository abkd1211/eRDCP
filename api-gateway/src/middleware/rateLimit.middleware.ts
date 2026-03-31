import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { Request, Response } from 'express';

const errorResponse = (_req: Request, res: Response): void => {
  res.status(429).json({
    success: false,
    message: 'Too many requests. Please slow down.',
    code:    'RATE_LIMIT_EXCEEDED',
  });
};

export const generalLimiter = rateLimit({
  windowMs:        env.RATE_LIMIT_WINDOW_MS,
  max:             env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         errorResponse,
  skip:            (req) => req.method === 'OPTIONS',
});

export const authLimiter = rateLimit({
  windowMs:        env.RATE_LIMIT_WINDOW_MS,
  max:             env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         errorResponse,
  skip:            (req) => req.method === 'OPTIONS',
});

export const strictLimiter = rateLimit({
  windowMs:        60_000,   // 1 minute
  max:             10,
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         errorResponse,
});
