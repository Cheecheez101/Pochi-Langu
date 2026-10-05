import type { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: 'Not Found',
    requestId: req.id,
    path: req.originalUrl,
  });
}

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  void _next;
  logger.error({ err, requestId: req.id, path: req.originalUrl }, 'Unhandled application error');

  res.status(500).json({
    ok: false,
    error: 'Internal Server Error',
    requestId: req.id,
  });
}
