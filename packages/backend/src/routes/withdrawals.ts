import { Router } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';
import { createWithdrawal, getWithdrawal, listWithdrawals } from '../domain/withdrawal.js';
import { Money } from '../domain/money.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { isValidKenyanPhone, normalizePhone } from '../domain/phone.js';

const router = Router();

const createSchema = z.object({
  amountMinor: z.coerce.bigint().positive(),
  phone: z.string().trim().min(9).max(20),
  idempotencyKey: z.string().trim().min(8).max(120),
});

router.use(requireAuthentication);

router.get('/', async (req, res, next) => {
  try {
    res.json({ ok: true, withdrawals: await listWithdrawals(database, req.auth!.userId) });
  } catch (error) {
    next(error);
  }
});

router.get('/:withdrawalId', async (req, res, next) => {
  try {
    res.json({ ok: true, withdrawal: await getWithdrawal(database, req.auth!.userId, req.params.withdrawalId) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Withdrawal not found') {
      res.status(404).json({ ok: false, error: error.message, requestId: req.id });
      return;
    }
    next(error);
  }
});

router.post('/:withdrawalId/reconcile', async (req, res, next) => {
  try {
    const withdrawalId = req.params.withdrawalId;
    const { receiptNumber } = req.body;
    const result = await database.raw(
      'SELECT * FROM reconcile_withdrawal(?, ?)',
      [withdrawalId, receiptNumber],
    );
    res.json({ ok: true, withdrawal: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Invalid withdrawal details', requestId: req.id });
    return;
  }
  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!isValidKenyanPhone(normalizedPhone)) {
    res.status(400).json({ ok: false, error: 'Use a valid Kenyan mobile number', requestId: req.id });
    return;
  }
  try {
    const withdrawal = await createWithdrawal(database, {
      userId: req.auth!.userId,
      amount: Money.fromMinor(parsed.data.amountMinor),
      phone: normalizedPhone,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    res.status(201).json({ ok: true, withdrawal });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Withdrawal amount must be positive')) {
      res.status(400).json({ ok: false, error: error.message, requestId: req.id });
      return;
    }
    next(error);
  }
});

export { router as withdrawalsRouter };