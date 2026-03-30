import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { sendError } from '../utils/response';

export const validate = (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = schema.parse({ body: req.body, query: req.query, params: req.params });
      
      // Update the request objects with transformed/validated data
      if (parsed.body)   req.body   = parsed.body;
      if (parsed.query)  {
        Object.defineProperty(req, 'query', {
          value: parsed.query,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
      if (parsed.params) {
        Object.defineProperty(req, 'params', {
          value: parsed.params,
          writable: true,
          configurable: true,
          enumerable: true
        });
      }
      
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
