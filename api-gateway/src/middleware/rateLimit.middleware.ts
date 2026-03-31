import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import { Request, Response } from 'express';
import logger from '../config/logger';

const errorResponse = (req: Request, res: Response): void => {
  logger.warn('Rate limit exceeded at Gateway', {
    ip:      req.ip,
    ips:     req.ips,
    path:    req.path,
    headers: req.headers['x-forwarded-for'],
  });

  res.status(429).json({
    success: false,
    message: 'Too many requests. Please slow down.',
    code:    'RATE_LIMIT_EXCEEDED',
    retryAfter: res.getHeader('Retry-After'),
  });
};

export const generalLimiter = rateLimit({
  windowMs:        env.RATE_LIMIT_WINDOW_MS,
  max:             env.RATE_LIMIT_MAX_REQUESTS || 2000, // Very high default for stability
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         errorResponse,
  skip:            (req) => req.method === 'OPTIONS',
  keyGenerator:    (req) => req.ip ?? req.headers['x-forwarded-for'] as string ?? 'unknown',
});

export const authLimiter = rateLimit({
  windowMs:        env.RATE_LIMIT_WINDOW_MS,
  max:             500, // Highly permissive for now to resolve 429s (was 100)
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         errorResponse,
  skip:            (req) => req.method === 'OPTIONS',
  keyGenerator:    (req) => req.ip ?? req.headers['x-forwarded-for'] as string ?? 'unknown',
});

export const strictLimiter = rateLimit({
  windowMs:        60_000,   // 1 minute
  max:             20,       // Increased from 10 to be safer
  standardHeaders: true,
  legacyHeaders:   false,
  handler:         errorResponse,
  keyGenerator:    (req) => req.ip ?? req.headers['x-forwarded-for'] as string ?? 'unknown',
});
