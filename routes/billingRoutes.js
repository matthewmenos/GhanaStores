import { Router } from 'express';
import { pool } from '../config/database.js';
import { requireSellerAuth, requireRole } from '../middleware/authMiddleware.js';
import { sendSms, templates } from '../services/smsService.js';

const router = Router();
const TRIAL_LENGTH_DAYS = Number(process.env.TRIAL_LENGTH_DAYS || 14);

/**
 * GET /api/billing/status
 * Returns the current subscription status + a countdown, used by
 * <TrialBanner /> to render the SVG countdown ring.
 */
router.get('/status', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT status, trial_ends_at, grace_ends_at, created_at
       FROM stores WHERE id = $1`,
      [req.auth.storeId]
    );

    const store = rows[0];
    if (!store) return res.status(404).json({ error: 'Store not found.' });

    const now = Date.now();
    const trialEndsAt = new Date(store.trial_ends_at).getTime();
    const daysRemaining = Math.max(0, Math.ceil((trialEndsAt - now) / 86_400_000));

    res.json({
      status: store.status,
      trialEndsAt: store.trial_ends_at,
      graceEndsAt: store.grace_ends_at,
      daysRemaining,
      isTrialing: store.status === 'TRIALING',
      isPastDue: store.status === 'PAST_DUE',
      isSuspended: store.status === 'SUSPENDED',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/billing/renew
 * Marks the store ACTIVE and clears grace period after a successful
 * subscription payment (payment collection itself happens via
 * hubtelService.initiateCollection in a dedicated checkout flow —
 * this endpoint is the confirmation step called from the webhook
 * handler or after the frontend confirms payment status).
 */
router.post('/renew', requireSellerAuth, requireRole('OWNER', 'MANAGER'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE stores
       SET status = 'ACTIVE',
           trial_ends_at = now() + INTERVAL '${TRIAL_LENGTH_DAYS} days',
           grace_ends_at = NULL
       WHERE id = $1
       RETURNING id, store_name, status, trial_ends_at`,
      [req.auth.storeId]
    );

    const store = rows[0];
    await pool.query(
      `INSERT INTO billing_events (store_id, event_type, metadata) VALUES ($1, 'REACTIVATED', $2)`,
      [store.id, JSON.stringify({ reactivatedBy: req.auth.staffId })]
    );

    res.json({ message: 'Subscription renewed.', store });
  } catch (err) {
    next(err);
  }
});

export default router;
