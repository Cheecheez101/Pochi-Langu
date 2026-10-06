import { Router } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';
import { requireAuthentication } from '../middleware/authentication.js';

const router = Router();
router.use(requireAuthentication);

const goalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().max(500).default(''),
  targetMinor: z.coerce.bigint().positive(),
  lockUntil: z.string().datetime().nullable().optional(),
});
const transferSchema = z.object({ amountMinor: z.coerce.bigint().positive() });

router.get('/', async (req, res, next) => {
  try {
    const goals = await database('vaults').select(
      'id', 'name', 'description', 'target_minor as targetMinor', 'balance_minor as balanceMinor',
      'status', 'lock_until as lockUntil', 'created_at as createdAt',
    ).where({ user_id: req.auth!.userId }).orderBy('created_at', 'desc');
    res.json({ ok: true, goals });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: 'Invalid savings goal', requestId: req.id }); return; }
  try {
    const result = await database.raw<{ rows: Array<Record<string, unknown>> }>(
      'SELECT * FROM create_savings_goal(?, ?, ?, ?, ?::timestamptz)',
      [req.auth!.userId, parsed.data.name, parsed.data.description, parsed.data.targetMinor.toString(), parsed.data.lockUntil ?? null],
    );
    res.status(201).json({ ok: true, goal: result.rows[0] });
  } catch (error) { next(error); }
});

router.post('/:goalId/deposit', async (req, res, next) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: 'Invalid savings transfer', requestId: req.id }); return; }
  try {
    const result = await database.raw<{ rows: Array<{ transfer_wallet_to_vault: string }> }>(
      'SELECT transfer_wallet_to_vault(?, ?, ?, ?) AS transfer_wallet_to_vault',
      [req.auth!.userId, req.params.goalId, parsed.data.amountMinor.toString(), `savings-in-${req.params.goalId}-${Date.now()}`],
    );
    res.status(201).json({ ok: true, journalEntryId: result.rows[0]?.transfer_wallet_to_vault });
  } catch (error) { next(error); }
});

router.post('/:goalId/withdraw', async (req, res, next) => {
  const parsed = transferSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ ok: false, error: 'Invalid savings transfer', requestId: req.id }); return; }
  try {
    const result = await database.raw<{ rows: Array<{ transfer_vault_to_wallet: string }> }>(
      'SELECT transfer_vault_to_wallet(?, ?, ?, ?) AS transfer_vault_to_wallet',
      [req.auth!.userId, req.params.goalId, parsed.data.amountMinor.toString(), `savings-out-${req.params.goalId}-${Date.now()}`],
    );
    res.status(201).json({ ok: true, journalEntryId: result.rows[0]?.transfer_vault_to_wallet });
  } catch (error) { next(error); }
});

export { router as savingsRouter };
