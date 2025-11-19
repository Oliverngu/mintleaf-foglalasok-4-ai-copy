import { Request, Response, NextFunction } from 'express';
import { ZodError, ZodTypeAny } from "zod";
import { ApiError } from '../utils/errors';

/**
 * Middleware to validate request body, query, or params against a Zod schema.
 * @param schema - The Zod schema to validate against.
 */
export const validate =
  (schema: ZodTypeAny) =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        const errorMessages = err.issues.map((issue) => ({
          message: `${issue.path.join('.')} is ${issue.message.toLowerCase()}`,
        }));
        return next(new ApiError(400, 'Invalid input', errorMessages));
      }

      return next(new ApiError(500, 'Internal Server Error during validation'));
    }
  };