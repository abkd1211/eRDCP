import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import redisClient, { REDIS_KEYS } from '../config/redis';
import logger from '../config/logger';

export interface GatewayRequest extends Request {
  user?: { id: string; email: string; role: string; jti: string; };
  correlationId?: string;
}

interface JwtPayload {
  sub: string; email: string; role: string; jti: string;
}

// ─── Attach correlation ID to every request ───────────────────────────────────
// Used to trace a single request across multiple services in logs
export const correlationId = (req: GatewayRequest, _res: Response, next: NextFunction): void => {
  req.correlationId = req.headers['x-correlation-id'] as string
    || `gw-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  next();
};

// ─── Verify JWT ────────────────────────────────────────────────────────────────
export const authenticate = async (
  req: GatewayRequest, res: Response, next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ success: false, message: 'No token provided', code: 'NO_TOKEN' });
      return;
    }

    const token   = authHeader.replace('Bearer ', '');
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    // Check Redis blacklist — handle Redis being down
    let blacklisted: string | null = null;
    try {
      blacklisted = await redisClient.get(REDIS_KEYS.blacklistedToken(payload.jti));
    } catch (err) {
      logger.warn('Redis unreachable during blacklist check', { error: (err as Error).message });
    }

    if (blacklisted) {
      res.status(401).json({ success: false, message: 'Token has been revoked', code: 'TOKEN_REVOKED' });
      return;
    }

    req.user = { id: payload.sub, email: payload.email, role: payload.role, jti: payload.jti };

    // Forward user info as headers to downstream services
    req.headers['x-user-id']    = payload.sub;
    req.headers['x-user-email'] = payload.email;
    req.headers['x-user-role']  = payload.role;
    req.headers['x-correlation-id'] = req.correlationId;

    next();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('Gateway auth error', { 
      error: msg, 
      tokenPrefix: req.headers.authorization?.slice(0, 15) 
    });
    
    if (msg.includes('expired')) {
      res.status(401).json({ success: false, message: 'Token has expired', code: 'TOKEN_EXPIRED' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid token', code: 'INVALID_TOKEN' });
    }
  }
};

// ─── Optional auth — attaches user if token present, doesn't fail if not ─────
export const optionalAuth = async (
  req: GatewayRequest, _res: Response, next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) { next(); return; }

    const token   = authHeader.replace('Bearer ', '');
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;

    const blacklisted = await redisClient.get(REDIS_KEYS.blacklistedToken(payload.jti));
    if (!blacklisted) {
      req.user = { id: payload.sub, email: payload.email, role: payload.role, jti: payload.jti };
      req.headers['x-user-id']   = payload.sub;
      req.headers['x-user-email']= payload.email;
      req.headers['x-user-role'] = payload.role;
    }
  } catch {
    // Ignore — optional auth doesn't fail
  }
  next();
};

// ─── Role guard ───────────────────────────────────────────────────────────────
export const requireRole = (...roles: string[]) =>
  (req: GatewayRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required', code: 'NO_TOKEN' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      logger.warn('Forbidden access attempt at gateway', {
        userId: req.user.id, role: req.user.role, path: req.path, required: roles,
      });
      res.status(403).json({ success: false, message: 'Insufficient permissions', code: 'FORBIDDEN' });
      return;
    }
    next();
  };
