import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.get('x-request-id') ?? randomUUID();
  req.id = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}
