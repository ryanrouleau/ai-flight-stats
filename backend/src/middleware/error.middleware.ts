import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

/**
 * Global error handling middleware
 * Use with express-async-errors to automatically catch async errors
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    res.status(400).json({
      error: 'Validation failed',
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
    return;
  }

  // Handle known error types
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  // Log errors in development
  if (process.env.NODE_ENV !== 'production') {
    console.error('❌ Error:', {
      message: err.message,
      stack: err.stack,
      statusCode,
      path: req.path,
      method: req.method,
    });
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && {
      stack: err.stack,
    }),
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
  });
}
