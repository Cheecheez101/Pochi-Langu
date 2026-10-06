import type { NextFunction, Request, Response } from 'express';
import { database } from '../config/database.js';
import { SESSION_COOKIE, hashSessionToken, parseCookies } from '../lib/session.js';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: {
      userId: string;
      sessionId: string;
      role?: 'user' | 'admin';
    };
  }
}

export async function requireAuthentication(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!token) {
    res.status(401).json({ ok: false, error: 'Authentication required', requestId: req.id });
    return;
  }

  const session = await database('auth_sessions')
    .select('id', 'user_id')
    .where({ token_hash: hashSessionToken(token) })
    .whereNull('revoked_at')
    .where('expires_at', '>', database.fn.now())
    .first<{ id: string; user_id: string }>();

  if (!session) {
    res.status(401).json({ ok: false, error: 'Authentication required', requestId: req.id });
    return;
  }

  await database('auth_sessions')
    .where({ id: session.id })
    .update({ last_seen_at: database.fn.now() });

  req.auth = { userId: session.user_id, sessionId: session.id };
  next();
}
