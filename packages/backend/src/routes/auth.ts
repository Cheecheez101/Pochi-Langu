import { randomUUID } from 'node:crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';
import { env } from '../config/env.js';
import { hashPassword, verifyPassword } from '../domain/password.js';
import {
  SESSION_COOKIE,
  SESSION_TTL_MS,
  createSessionToken,
  hashSessionToken,
  parseCookies,
  sessionExpiry,
} from '../lib/session.js';
import { logger } from '../lib/logger.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { normalizePhone } from '../domain/phone.js';

const router = Router();
const credentialsSchema = z.object({
  phone: z.string().trim().min(9).max(20),
  password: z.string().min(12).max(128),
});
const registrationSchema = credentialsSchema.extend({
  displayName: z.string().trim().min(1).max(80),
});

function setSessionCookie(res: Response, token: string): void {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Max-Age=${SESSION_TTL_MS / 1000}; Path=/api; HttpOnly; SameSite=Lax${secure}`,
  );
}

function clearSessionCookie(res: Response): void {
  const secure = env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Max-Age=0; Path=/api; HttpOnly; SameSite=Lax${secure}`);
}

async function createSession(userId: string, res: Response): Promise<void> {
  const token = createSessionToken();
  await database('auth_sessions').insert({
    id: randomUUID(),
    user_id: userId,
    token_hash: hashSessionToken(token),
    expires_at: sessionExpiry(),
  });
  setSessionCookie(res, token);
}

router.post('/register', async (req, res, next) => {
  const parsed = registrationSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Invalid registration details', fields: parsed.error.flatten().fieldErrors, requestId: req.id });
    return;
  }

  const phone = normalizePhone(parsed.data.phone);
  if (!/^\+254[17]\d{8}$/.test(phone)) {
    res.status(400).json({ ok: false, error: 'Use a valid Kenyan mobile number', requestId: req.id });
    return;
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const userId = await database.transaction(async (trx) => {
      const result = await trx.raw<{ rows: Array<{ register_identity_user: string }> }>(
        'SELECT register_identity_user(?, ?, ?) AS register_identity_user',
        [phone, parsed.data.displayName, passwordHash],
      );
      return result.rows[0]?.register_identity_user;
    });
    if (!userId) throw new Error('Registered user could not be loaded');
    await createSession(userId, res);
    res.status(201).json({ ok: true, user: { id: userId, phone, displayName: parsed.data.displayName } });
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      res.status(409).json({ ok: false, error: 'An account with that phone number already exists', requestId: req.id });
      return;
    }
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  const parsed = credentialsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Invalid phone number or password', requestId: req.id });
    return;
  }

  try {
    const phone = normalizePhone(parsed.data.phone);
    const user = await database('users as u')
      .join('user_credentials as c', 'c.user_id', 'u.id')
      .leftJoin('user_profiles as p', 'p.user_id', 'u.id')
      .leftJoin('user_roles as r', 'r.user_id', 'u.id')
      .select('u.id', 'u.phone_e164', 'u.status', 'c.password_hash', 'p.display_name', 'r.role')
      .where({ 'u.phone_e164': phone })
      .first<{ id: string; phone_e164: string; status: string; password_hash: string; display_name: string | null; role: 'user' | 'admin' }>();

    const valid = user ? await verifyPassword(parsed.data.password, user.password_hash) : false;
    if (!user || !valid || user.status !== 'active') {
      res.status(401).json({ ok: false, error: 'Invalid phone number or password', requestId: req.id });
      return;
    }

    await createSession(user.id, res);
    res.status(200).json({ ok: true, user: { id: user.id, phone: user.phone_e164, displayName: user.display_name, role: user.role } });
  } catch (error) {
    logger.warn({ requestId: req.id }, 'Login request failed');
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    if (token) {
      await database('auth_sessions')
        .where({ token_hash: hashSessionToken(token) })
        .whereNull('revoked_at')
        .update({ revoked_at: database.fn.now() });
    }
    clearSessionCookie(res);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

router.get('/me', requireAuthentication, async (req, res, next) => {
  try {
    const user = await database('users as u')
      .leftJoin('user_profiles as p', 'p.user_id', 'u.id')
      .leftJoin('user_roles as r', 'r.user_id', 'u.id')
      .select('u.id', 'u.phone_e164', 'u.status', 'p.display_name', 'r.role')
      .where('u.id', req.auth?.userId)
      .first<{ id: string; phone_e164: string; status: string; display_name: string | null; role: 'user' | 'admin' }>();

    if (!user || user.status !== 'active') {
      res.status(401).json({ ok: false, error: 'Authentication required', requestId: req.id });
      return;
    }
    res.status(200).json({ ok: true, user: { id: user.id, phone: user.phone_e164, displayName: user.display_name, role: user.role } });
  } catch (error) {
    next(error);
  }
});

export { router as authRouter };
