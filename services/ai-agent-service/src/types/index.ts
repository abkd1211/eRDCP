import { Request } from 'express';
import { Response } from 'express';

export interface AuthenticatedRequest extends Request {
  user: { id: string; email: string; role: string; jti: string; };
}

export interface ApiSuccess<T = unknown> {
  success: true; message: string; data: T;
}
export interface ApiError {
  success: false; message: string; errors?: Record<string, string[]>; code?: string;
}

export const sendSuccess = <T>(res: Response, status: number, message: string, data: T): Response =>
  res.status(status).json({ success: true, message, data } as ApiSuccess<T>);

export const sendError = (
  res: Response, status: number, message: string,
  errors?: Record<string, string[]>, code?: string
): Response =>
  res.status(status).json({ success: false, message, ...(errors && { errors }), ...(code && { code }) } as ApiError);
