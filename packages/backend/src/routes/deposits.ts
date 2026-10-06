import { Router } from 'express';
import { z } from 'zod';
import { database } from '../config/database.js';
import { createDeposit, getDeposit, listDeposits, applyDepositResult } from '../domain/deposit.js';
import { paymentProvider } from '../domain/payment-provider.js';
import { reconcileMissingDeposit } from '../domain/reconciliation.js';
import { Money } from '../domain/money.js';
import { requireAuthentication } from '../middleware/authentication.js';
import { isValidKenyanPhone, normalizePhone } from '../domain/phone.js';

const router = Router();

const createSchema = z.object({
  amountMinor: z.coerce.bigint().positive(),
  phone: z.string().trim().min(9).max(20),
  idempotencyKey: z.string().trim().min(8).max(120),
});

router.post('/callback', express.raw({ type: 'application/json' }), async (req, res, next) => {
  try {
    const callback = paymentProvider.parseCallback(req.body);
    const current = await database('deposits').where({ provider_reference: callback.providerReference }).first();
    if (!current) {
      res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
      return;
    }
    await applyDepositResult(database, current.id, callback);
    res.status(200).json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    next(error);
  }
});

router.post('/:depositId/reconcile', async (req, res, next) => {
  try {
    const depositId = req.params.depositId;
    const { receiptNumber } = req.body;
    const result = await reconcileMissingDeposit(database, depositId, receiptNumber);
    if (!result.reconciled) {
      res.status(400).json({ ok: false, error: result.error, requestId: req.id });
      return;
    }
    res.json({ ok: true, deposit: result.deposit });
  } catch (error) {
    next(error);
  }
});

router.use(requireAuthentication);

router.get('/', async (req, res, next) => {
  try {
    res.json({ ok: true, deposits: await listDeposits(database, req.auth!.userId) });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'Invalid deposit details', requestId: req.id });
    return;
  }
  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!isValidKenyanPhone(normalizedPhone)) {
    res.status(400).json({ ok: false, error: 'Use a valid Kenyan mobile number', requestId: req.id });
    return;
  }
  try {
    const deposit = await createDeposit(database, {
      userId: req.auth!.userId,
      amount: Money.fromMinor(parsed.data.amountMinor),
      phone: normalizedPhone,
      idempotencyKey: parsed.data.idempotencyKey,
    });
    res.status(201).json({ ok: true, deposit });
  } catch (error) {
    if (error instanceof Error && error.message.includes('Deposit amount must be positive')) {
      res.status(400).json({ ok: false, error: error.message, requestId: req.id });
      return;
    }
    next(error);
  }
});

router.get('/:depositId', async (req, res, next) => {
  try {
    res.json({ ok: true, deposit: await getDeposit(database, req.auth!.userId, req.params.depositId) });
  } catch (error) {
    if (error instanceof Error && error.message === 'Deposit not found') {
      res.status(404).json({ ok: false, error: error.message, requestId: req.id });
      return;
    }
    next(error);
  }
});

export { router as depositsRouter };
