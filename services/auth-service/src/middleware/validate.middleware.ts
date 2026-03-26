import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      schema.parse({
        body:   req.body,
        query:  req.query,
        params: req.params,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errors: Record<string, string[]> = {};
        err.errors.forEach((e) => {
          const key = e.path.slice(1).join('.') || 'general';
          if (!errors[key]) errors[key] = [];
          errors[key].push(e.message);
        });
        sendError(res, 422, 'Validation failed', errors, 'VALIDATION_ERROR');
        return;
      }
      next(err);
    }
  };
};
