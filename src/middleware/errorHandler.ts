import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error & { statusCode?: number; name?: string; code?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error(err);

  if (err.name === 'CastError') {
    res.status(400).json({ message: 'Invalid identifier' });
    return;
  }
  if (err.name === 'ValidationError') {
    res.status(400).json({ message: err.message });
    return;
  }
  if (err.code === 11000) {
    res.status(409).json({ message: 'A record with these details already exists' });
    return;
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    message: err.statusCode ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export class AppError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
