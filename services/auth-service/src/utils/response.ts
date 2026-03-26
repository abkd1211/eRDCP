import { Response } from 'express';
import { ApiSuccess, ApiError } from '../types';

export const sendSuccess = <T>(
  res: Response,
  statusCode: number,
  message: string,
  data: T
): Response => {
  const body: ApiSuccess<T> = { success: true, message, data };
  return res.status(statusCode).json(body);
};

export const sendError = (
  res: Response,
  statusCode: number,
  message: string,
  errors?: Record<string, string[]>,
  code?: string
): Response => {
  const body: ApiError = { success: false, message, ...(errors && { errors }), ...(code && { code }) };
  return res.status(statusCode).json(body);
};
