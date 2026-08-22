import { Router } from 'express';
import { z } from 'zod';
import { withTransaction, pool } from '../config/database.js';
import { requireSellerAuth, requireRole, requireActiveSubscription } from '../middleware/authMiddleware.js';
import { disburseToMomo } from '../services/hubtelService.js';
import { sendSms, templates } from '../services/smsService.js';

const router = Router();
const AUTO_APPROVE_THRESHOLD = Number(process.env.PAYOUT_AUTO_APPROVE_THRESHOLD_GHS || 5000);

const payoutRequestSchema = z.object({
  amount: z.number().positive(),
});

/**
 * GET /api/payouts/balance
 */
router.get('/balance', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT available_balance, pending_balance, rider_transit_balance
       FROM store_wallets WHERE store_id = $1`,
      [req.auth.storeId]
    );
    const wallet = rows[0];
    res.json({
      availableBalance: Number(wallet.available_balance),
      pendingBalance: Number(wallet.pending_balance),
      riderTransitBalance: Number(wallet.rider_transit_balance),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payouts/request
 * Debits available_balance under a row lock (FOR UPDATE) to prevent
 * double-spends from concurrent requests, then either auto-approves
 * and disburses instantly (below risk threshold) or queues for manual
 * review by the platform admin.
 */
router.post('/request', requireSellerAuth, requireRole('OWNER', 'MANAGER'), requireActiveSubscription, async (req, res, next) => {
  try {
    const { amount } = payoutRequestSchema.parse(req.body);
    const storeId = req.auth.storeId;

    const { store, payout } = await withTransaction(async (client) => {
      const { rows: storeRows } = await client.query(
        `SELECT store_name, momo_network, momo_number FROM stores WHERE id = $1`,
        [storeId]
      );
      const store = storeRows[0];
      if (!store.momo_number) throw httpError(400, 'No Mobile Money number on file for this store.');

      const { rows: walletRows } = await client.query(
        `SELECT available_balance FROM store_wallets WHERE store_id = $1 FOR UPDATE`,
        [storeId]
      );
      const available = Number(walletRows[0].available_balance);
      if (available < amount) throw httpError(400, 'Insufficient available balance.');

      const autoApprove = amount <= AUTO_APPROVE_THRESHOLD;

      await client.query(
        `UPDATE store_wallets
         SET available_balance = available_balance - $2,
             pending_balance = pending_balance + $2,
             updated_at = now()
         WHERE store_id = $1`,
        [storeId, amount]
      );

      const { rows: payoutRows } = await client.query(
        `INSERT INTO payouts (store_id, amount, momo_network, momo_number, status)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, amount, status, requested_at`,
        [storeId, amount, store.momo_network, store.momo_number, autoApprove ? 'APPROVED' : 'REQUESTED']
      );

      return { store, payout: payoutRows[0] };
    });

    // Disbursement is fired outside the DB transaction (external API call)
    // but only for auto-approved payouts. Manual-review payouts are picked
    // up by a platform admin action that calls the same disbursement path.
    if (payout.status === 'APPROVED') {
      disburseAndFinalize({ payout, store, storeId }).catch((e) =>
        console.error('[payoutRoutes] disbursement failed:', e.message)
      );
    }

    res.status(201).json({
      payoutId: payout.id,
      amount: Number(payout.amount),
      status: payout.status,
      autoApproved: payout.status === 'APPROVED',
    });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

/**
 * Calls Hubtel to actually move the money, then reconciles the wallet's
 * pending_balance and notifies the merchant. Runs after the HTTP response
 * has already been sent so the seller isn't blocked on Hubtel's latency.
 */
async function disburseAndFinalize({ payout, store, storeId }) {
  try {
    const result = await disburseToMomo({
      payoutId: payout.id,
      storeId,
      amountGhs: Number(payout.amount),
      network: store.momo_network,
      momoNumber: store.momo_number,
      recipientName: store.store_name,
    });

    await pool.query(
      `UPDATE payouts SET status = 'PAID', hubtel_transaction_id = $2, completed_at = now() WHERE id = $1`,
      [payout.id, result.hubtelTransactionId]
    );
    await pool.query(
      `UPDATE store_wallets SET pending_balance = pending_balance - $2, updated_at = now() WHERE store_id = $1`,
      [storeId, payout.amount]
    );

    await sendSms({
      storeId,
      toPhone: store.momo_number,
      purpose: 'PAYOUT_CONFIRMATION',
      message: templates.payoutConfirmation(Number(payout.amount), store.momo_number),
    });
  } catch (err) {
    await pool.query(
      `UPDATE payouts SET status = 'FAILED', failure_reason = $2 WHERE id = $1`,
      [payout.id, err.message]
    );
    // Return funds to available balance since the disbursement never landed
    await pool.query(
      `UPDATE store_wallets
       SET pending_balance = pending_balance - $2, available_balance = available_balance + $2, updated_at = now()
       WHERE store_id = $1`,
      [storeId, payout.amount]
    );
  }
}

/**
 * GET /api/payouts/history
 */
router.get('/history', requireSellerAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, amount, status, momo_network, momo_number, requested_at, completed_at
       FROM payouts WHERE store_id = $1 ORDER BY requested_at DESC LIMIT 50`,
      [req.auth.storeId]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

function httpError(statusCode, message) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

export default router;
