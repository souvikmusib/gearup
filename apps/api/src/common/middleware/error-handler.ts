import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';
import { logger } from '../logger';
import { Sentry } from '../../config/sentry';
import type { ApiResponse } from '@gearup/types';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  logger.error({ err }, err.message);

  if (err instanceof AppError) {
    const body: ApiResponse = {
      success: false,
      error: { code: err.code, message: err.message, details: err.details },
    };
    return res.status(err.statusCode).json(body);
  }

  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    err.errors.forEach((e) => {
      const path = e.path.join('.');
      details[path] = details[path] || [];
      details[path].push(e.message);
    });
    const body: ApiResponse = {
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details },
    };
    return res.status(400).json(body);
  }

  // Capture unexpected errors in Sentry
  Sentry.captureException(err);

  const body: ApiResponse = {
    success: false,
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  };
  return res.status(500).json(body);
}
