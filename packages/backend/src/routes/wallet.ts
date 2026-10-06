import { Router } from 'express';
import { database } from '../config/database.js';
import { requireAuthentication } from '../middleware/authentication.js';

const router = Router();
router.use(requireAuthentication);

router.get('/', async (req, res, next) => {
  try {
    const wallet = await database('wallets')
      .select(
        'id',
        'currency',
        'available_minor as availableMinor',
        'locked_minor as lockedMinor',
        'pending_minor as pendingMinor',
        'status',
      )
      .where({ user_id: req.auth?.userId })
      .first();
    if (!wallet) {
      res.status(404).json({ ok: false, error: 'Wallet not found', requestId: req.id });
      return;
    }
    res.json({ ok: true, wallet });
  } catch (error) {
    next(error);
  }
});

export { router as walletRouter };
