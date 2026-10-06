import { Router } from 'express';
import { database } from '../config/database.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { requireAdmin } from '../middleware/authorization.js';

const router = Router();
router.use(requireAuthentication, requireAdmin);

router.get('/dashboard', async (_req, res, next) => {
  try {
    const [userCount, sessionCount] = await Promise.all([
      database('users').count<{ count: string }>({ count: '*' }).first(),
      database('auth_sessions').whereNull('revoked_at').where('expires_at', '>', database.fn.now())
        .count<{ count: string }>({ count: '*' }).first(),
    ]);
    res.json({
      ok: true,
      statistics: {
        users: Number(userCount?.count ?? 0),
        activeSessions: Number(sessionCount?.count ?? 0),
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get('/users', async (_req, res, next) => {
  try {
    const users = await database('users as u')
      .join('user_profiles as p', 'p.user_id', 'u.id')
      .join('user_roles as r', 'r.user_id', 'u.id')
      .select('u.id', 'u.phone_e164 as phone', 'u.status', 'p.display_name as displayName', 'r.role', 'u.created_at as createdAt')
      .orderBy('u.created_at', 'desc')
      .limit(100);
    res.json({ ok: true, users });
  } catch (error) {
    next(error);
  }
});

router.get('/users/:userId', async (req, res, next) => {
  try {
    const user = await database('users as u')
      .join('user_profiles as p', 'p.user_id', 'u.id')
      .join('user_roles as r', 'r.user_id', 'u.id')
      .select('u.id', 'u.phone_e164 as phone', 'u.status', 'p.display_name as displayName', 'r.role', 'u.created_at as createdAt')
      .where('u.id', req.params.userId)
      .first();
    if (!user) {
      res.status(404).json({ ok: false, error: 'User not found', requestId: req.id });
      return;
    }
    res.json({ ok: true, user });
  } catch (error) {
    next(error);
  }
});

router.get('/transactions', async (_req, res, next) => {
  try {
    const transactions = await database('transactions')
      .select('id', 'user_id as userId', 'type', 'status', 'amount_minor as amountMinor', 'currency', 'created_at as createdAt')
      .orderBy('created_at', 'desc')
      .limit(100);
    res.json({ ok: true, transactions });
  } catch (error) {
    next(error);
  }
});

export { router as adminRouter };
