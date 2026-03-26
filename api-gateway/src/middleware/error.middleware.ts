import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

interface AppError extends Error {
  status?: number;
  code?:   string;
}

export const errorHandler = (
  err: AppError, req: Request, res: Response, _next: NextFunction
): void => {
  const status  = err.status ?? 500;
  const message = status === 500 ? 'An unexpected gateway error occurred' : err.message;

  if (status === 500) {
    logger.error('Gateway unhandled error', { error: err.message, stack: err.stack, path: req.path });
  }

  res.status(status).json({ success: false, message, code: err.code ?? 'GATEWAY_ERROR' });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
    code:    'NOT_FOUND',
    hint:    'Check the API documentation for valid routes',
  });
};
