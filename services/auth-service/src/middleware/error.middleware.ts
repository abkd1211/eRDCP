import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { sendError } from '../utils/response';

interface AppError extends Error {
  status?: number;
  code?:   string;
}

export const errorHandler = (err: AppError, req: Request, res: Response, _next: NextFunction): void => {
  const status  = err.status  ?? 500;
  const code    = err.code    ?? 'INTERNAL_ERROR';
  const message = status === 500 ? 'An unexpected error occurred' : err.message;

  if (status === 500) {
    logger.error('Unhandled error', {
      error:  err.message,
      stack:  err.stack,
      path:   req.path,
      method: req.method,
    });
  } else {
    logger.warn('Request error', { code, message: err.message, path: req.path });
  }

  sendError(res, status, message, undefined, code);
};

export const notFoundHandler = (req: Request, res: Response): void => {
  sendError(res, 404, `Route ${req.method} ${req.path} not found`, undefined, 'NOT_FOUND');
};
