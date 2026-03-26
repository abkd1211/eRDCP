import { Response } from 'express';
import { ApiSuccess, ApiError } from '../types';

export const sendSuccess = <T>(res: Response, status: number, message: string, data: T): Response =>
  res.status(status).json({ success: true, message, data } as ApiSuccess<T>);

export const sendError = (
  res: Response,
  status: number,
  message: string,
  errors?: Record<string, string[]>,
  code?: string
): Response =>
  res.status(status).json({
    success: false, message,
    ...(errors && { errors }),
    ...(code && { code }),
  } as ApiError);
