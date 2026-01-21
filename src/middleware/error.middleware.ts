import { Request, Response, NextFunction } from 'express';

export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // 1. Log the error for the developer
  console.error(`[Error] ${req.method} ${req.path}:`, err.message);

  // 2. Determine the status code
  // Some database errors have a 'code' property (like Postgres)
  const statusCode = err.statusCode || 500;

  // 3. Send the response
  res.status(statusCode).json({
    success: false,
    message: err.message || 'An unexpected error occurred',
    // In development, send the stack trace to help debug
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};