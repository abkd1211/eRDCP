import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import redisClient from '../config/redis';
import { sendError } from '../utils/response';
import { AuthenticatedRequest } from '../types';

interface JwtPayload {
  sub:   string;
  email: string;
  role:  string;
  jti:   string;
}

// ─── Authenticate ─────────────────────────────────────────────────────────────
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 401, 'No token provided', undefined, 'NO_TOKEN');
      return;
    }

    const token   = authHeader.replace('Bearer ', '');
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    // Check blacklist in Redis
    const blacklisted = await redisClient.get(`blacklist:${payload.jti}`);
    if (blacklisted) {
      sendError(res, 401, 'Token has been revoked', undefined, 'TOKEN_REVOKED');
      return;
    }

    (req as AuthenticatedRequest).user = {
      id:    payload.sub,
      email: payload.email,
      role:  payload.role,
      jti:   payload.jti,
    };

    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message.includes('expired')) {
      sendError(res, 401, 'Token has expired', undefined, 'TOKEN_EXPIRED');
    } else {
      sendError(res, 401, 'Invalid token', undefined, 'INVALID_TOKEN');
    }
  }
};

// ─── Authorise by Role ────────────────────────────────────────────────────────
export const authorise = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) {
      sendError(res, 403, 'Insufficient permissions', undefined, 'FORBIDDEN');
      return;
    }
    next();
  };
