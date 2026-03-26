import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { verifyAccessToken } from '../utils/jwt';
import redisClient, { REDIS_KEYS } from '../config/redis';
import { sendError } from '../utils/response';
import { AuthenticatedRequest } from '../types';
import { env } from '../config/env';
import logger from '../config/logger';

// ─── Authenticate JWT ────────────────────────────────────────────────────────
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      sendError(res, 401, 'No token provided', undefined, 'NO_TOKEN');
      return;
    }

    const token = authHeader.replace('Bearer ', '');
    const payload = verifyAccessToken(token);

    // Check if token is blacklisted
    const blacklisted = await redisClient.get(REDIS_KEYS.blacklistedToken(payload.jti));
    if (blacklisted) {
      sendError(res, 401, 'Token has been revoked', undefined, 'TOKEN_REVOKED');
      return;
    }

    // Attach user to request
    (req as AuthenticatedRequest).user = {
      id:    payload.sub,
      email: payload.email,
      role:  payload.role,
      jti:   payload.jti,
    };

    next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    if (message.includes('expired')) {
      sendError(res, 401, 'Token has expired', undefined, 'TOKEN_EXPIRED');
    } else {
      sendError(res, 401, 'Invalid token', undefined, 'INVALID_TOKEN');
    }
  }
};

// ─── Authorise by Role ────────────────────────────────────────────────────────
export const authorise = (...allowedRoles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      sendError(res, 401, 'Not authenticated', undefined, 'NOT_AUTHENTICATED');
      return;
    }

    if (!allowedRoles.includes(authReq.user.role)) {
      logger.warn('Unauthorised access attempt', {
        userId: authReq.user.id,
        role:   authReq.user.role,
        path:   req.path,
        requiredRoles: allowedRoles,
      });
      sendError(res, 403, 'You do not have permission to access this resource', undefined, 'FORBIDDEN');
      return;
    }

    next();
  };
};

// ─── Internal Service Auth ────────────────────────────────────────────────────
// Used by the API Gateway to call /auth/verify-token
export const internalAuth = (req: Request, res: Response, next: NextFunction): void => {
  const secret = req.headers['x-internal-secret'];
  if (secret !== env.INTERNAL_SERVICE_SECRET) {
    sendError(res, 403, 'Forbidden — internal endpoint', undefined, 'FORBIDDEN');
    return;
  }
  next();
};
