import type { NextFunction, Request, Response } from 'express';
import { database } from '../config/database.js';

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.auth) {
    res.status(401).json({ ok: false, error: 'Authentication required', requestId: req.id });
    return;
  }

  const role = await database('user_roles')
    .select('role')
    .where({ user_id: req.auth.userId })
    .first<{ role: string }>();
  if (role?.role !== 'admin') {
    res.status(403).json({ ok: false, error: 'Administrator access required', requestId: req.id });
    return;
  }
  next();
}
