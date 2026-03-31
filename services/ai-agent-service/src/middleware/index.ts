import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ZodSchema, ZodError } from 'zod';
import rateLimit from 'express-rate-limit';
import { env } from '../config/env';
import redisClient from '../config/redis';
import { sendError } from '../types';
import { AuthenticatedRequest } from '../types';

interface JwtPayload { sub: string; email: string; role: string; jti: string; }

// ─── JWT Auth ─────────────────────────────────────────────────────────────────
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 401, 'No token provided', undefined, 'NO_TOKEN'); return;
    }
    const token   = authHeader.replace('Bearer ', '');
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    const blacklisted = await redisClient.get(`blacklist:${payload.jti}`);
    if (blacklisted) { sendError(res, 401, 'Token revoked', undefined, 'TOKEN_REVOKED'); return; }

    (req as AuthenticatedRequest).user = {
      id: payload.sub, email: payload.email, role: payload.role, jti: payload.jti,
    };
    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    sendError(res, 401, msg.includes('expired') ? 'Token expired' : 'Invalid token',
      undefined, msg.includes('expired') ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN');
  }
};

export const authorise = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) {
      sendError(res, 403, 'Insufficient permissions', undefined, 'FORBIDDEN'); return;
    }
    next();
  };

// ─── Zod Validation ───────────────────────────────────────────────────────────
export const validate = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse({ body: req.body, query: req.query, params: req.params });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors: Record<string, string[]> = {};
        err.errors.forEach((e) => {
          const key = e.path.slice(1).join('.') || 'general';
          if (!errors[key]) errors[key] = [];
          errors[key].push(e.message);
        });
        sendError(res, 422, 'Validation failed', errors, 'VALIDATION_ERROR'); return;
      }
      next(err);
    }
  };

// ─── Error Handler ────────────────────────────────────────────────────────────
interface AppError extends Error { status?: number; code?: string; }

export const errorHandler = (err: AppError, req: Request, res: Response, _next: NextFunction): void => {
  const status  = err.status ?? 500;
  const code    = err.code   ?? 'INTERNAL_ERROR';
  const message = status === 500 ? 'An unexpected error occurred' : err.message;
  sendError(res, status, message, undefined, code);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(res, 404, `Route ${req.method} ${req.path} not found`, undefined, 'NOT_FOUND');
};

// Check if request is from the internal gateway with the correct secret
const skipGateway = (req: Request): boolean => {
  return req.headers['x-gateway'] === 'true' && 
         req.headers['x-internal-secret'] === env.INTERNAL_SERVICE_SECRET;
};

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
export const generalLimiter = rateLimit({
  windowMs:        env.RATE_LIMIT_WINDOW_MS,
  max:             env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: (_req: Request, res: Response) =>
    sendError(res, 429, 'Too many requests.', undefined, 'RATE_LIMIT_EXCEEDED'),
  skip: (req) => req.method === 'OPTIONS' || skipGateway(req),
});
