import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import redisClient from '../config/redis';
import { sendError } from '../utils/response';
import { AuthenticatedRequest } from '../types';

interface JwtPayload { sub: string; email: string; role: string; jti: string; }

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    // 1. Gateway Trust Bypass
    const isGateway = req.headers['x-gateway'] === 'true';
    const hasSecret = req.headers['x-internal-secret'] === env.INTERNAL_SERVICE_SECRET;
    
    if (isGateway && hasSecret) {
      const gUserId    = req.headers['x-user-id']    as string;
      const gUserEmail = req.headers['x-user-email'] as string;
      const gUserRole  = req.headers['x-user-role']  as string;

      if (gUserId && gUserRole) {
        (req as AuthenticatedRequest).user = {
          id:    gUserId,
          email: gUserEmail ?? '',
          role:  gUserRole,
          jti:   'gw-trusted',
        };
        return next();
      }
    }

    // 2. Standard JWT Authentication (fallback)
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 401, 'No token provided', undefined, 'NO_TOKEN');
      return;
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
    console.error('Auth error in service:', msg);
    
    if (msg.includes('expired')) {
      sendError(res, 401, 'Token expired', undefined, 'TOKEN_EXPIRED');
    } else {
      sendError(res, 401, 'Invalid token', undefined, 'INVALID_TOKEN');
    }
    return; // FIXED: Added missing return to prevent crash
  }
};

export const authorise = (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as AuthenticatedRequest).user;
    if (!user || !roles.includes(user.role)) {
      sendError(res, 403, 'Insufficient permissions', undefined, 'FORBIDDEN');
      return;
    }
    next();
  };
