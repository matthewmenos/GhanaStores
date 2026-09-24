/**
 * DiDwa - Instant Seller Payout Routes
 * MODULE 3: Wallet split into available_balance / pending_balance with
 * SELECT ... FOR UPDATE row locking. Requests under the risk threshold
 * (default GHS 5,000) trigger an instant 2-way MoMo disbursement - MTN
 * numbers via the MTN MoMo API with one Hubtel retry on failure, other
 * networks straight via Hubtel - and are marked APPROVED; larger requests
 * park funds as PENDING_REVIEW for admin sign-off.
 */
import { Router } from 'express';
import { pool, query } from '../config/database.js';
import { requireSeller, requireAdmin, requireActiveSeller } from '../middleware/authMiddleware.js';
import { routeDisbursement } from '../services/paymentRouter.js';
import { sendPayoutSms } from '../services/smsService.js';
import { normalizeGhPhone, money } from '../utils/helpers.js';

const router = Router();

const MIN_PAYOUT_GHS = 50;
const RISK_THRESHOLD_GHS = Number(process.env.RISK_THRESHOLD_GHS || 5000);

/* --------------------------------- Summary ---------------------------------- */
router.get('/summary', requireSeller, async (req, res, next) => {
  try {
    const [bal, stats] = await Promise.all([
      query(
        `SELECT available_balance, pending_balance, currency, momo_number
           FROM stores WHERE id = $1`,
        [req.auth.sub],
      ),
      query(
        `SELECT COUNT(*)::int AS total_payouts,
                COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0)::numeric(14,2) AS total_paid_out,
                COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING_REVIEW'), 0)::numeric(14,2) AS awaiting_review
           FROM payouts WHERE store_id = $1`,
        [req.auth.sub],
      ),
    ]);
    res.json({ wallet: bal.rows[0], stats: stats.rows[0], riskThresholdGhs: RISK_THRESHOLD_GHS });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------- Request payout ------------------------------ */
// requireActiveSeller (not just requireSeller): suspended stores must not be
// able to move wallet funds out through cashouts.
router.post('/request', requireActiveSeller, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const amount = money(req.body?.amount);
    const network = String(req.body?.network || 'MTN').toUpperCase();
    const destination = normalizeGhPhone(req.body?.destination || req.body?.momoNumber);

    if (!Number.isFinite(amount) || amount < MIN_PAYOUT_GHS) {
      client.release();
      return res.status(400).json({ error: `Minimum payout is GHS ${MIN_PAYOUT_GHS.toFixed(2)}.` });
    }
    if (!destination) {
      client.release();
      return res.status(400).json({ error: 'Enter a valid Ghana MoMo number (e.g. 0244123456).' });
    }
    if (!['MTN', 'VODAFONE', 'AT'].includes(network)) {
      client.release();
      return res.status(400).json({ error: 'Network must be MTN, VODAFONE (Telecel) or AT.' });
    }

    /* ---- Atomic balance check with FOR UPDATE row lock ---- */
    await client.query('BEGIN');
    const lockRes = await client.query(
      `SELECT available_balance, pending_balance, phone
         FROM stores WHERE id = $1 FOR UPDATE`,
      [req.auth.sub],
    );
    const storeRow = lockRes.rows[0];
    if (!storeRow) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Store not found.' });
    }
    if (amount > Number(storeRow.available_balance)) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({
        error: `Insufficient available balance. Available: GHS ${Number(storeRow.available_balance).toFixed(2)}.`,
      });
    }

    const needsReview = amount >= RISK_THRESHOLD_GHS;

    if (needsReview) {
      // Large request: move funds to pending, wait for admin approval.
      const inserted = await client.query(
        `INSERT INTO payouts (store_id, amount, destination, network, status)
         VALUES ($1,$2,$3,$4,'PENDING_REVIEW')
         RETURNING id, status`,
        [req.auth.sub, amount, destination, network],
      );
      await client.query(
        `UPDATE stores
            SET available_balance = available_balance - $2,
                pending_balance   = pending_balance + $2
          WHERE id = $1`,
        [req.auth.sub, amount],
      );
      await client.query('COMMIT');
      client.release();
      return res.status(202).json({
        message: `GHS ${amount.toFixed(2)} queued for review. Requests of GHS ${RISK_THRESHOLD_GHS.toLocaleString()}+ need manual approval.`,
        payout: inserted.rows[0],
      });
    }

    /* ---- Below threshold: MTN-first instant disbursement, Hubtel fallback ---- */
    // Intent-first: reserve the funds AND record the payout as PROCESSING
    // before any gateway call moves money, then release the DB lock and the
    // client connection while the network call runs. If the gateway then
    // succeeds but the follow-up bookkeeping fails, the PROCESSING row stays
    // visible for reconciliation instead of money moving silently.
    // MTN destinations try the MTN MoMo API once; any failure/timeout/pending
    // result retries exactly once via Hubtel inside routeDisbursement.
    const reference = `GS-PAY-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await client.query(
      `UPDATE stores SET available_balance = available_balance - $2 WHERE id = $1`,
      [req.auth.sub, amount],
    );
    const intent = await client.query(
      `INSERT INTO payouts (store_id, amount, destination, network, provider,
                            fallback_used, mtn_status, status, reference)
       VALUES ($1,$2,$3,$4,'PENDING','PENDING','PENDING','PROCESSING',$5)
       RETURNING id`,
      [req.auth.sub, amount, destination, network, reference],
    );
    const payoutId = intent.rows[0].id;
    await client.query('COMMIT');
    client.release();

    const result = await routeDisbursement({
      destination,
      amount,
      network,
      description: `${req.store?.name || 'DiDwa'} instant cashout`,
      clientReference: reference,
    });

    const provider = result.provider || 'HUBTEL';
    const fallbackUsed = Boolean(result.fallback);

    if (result.success) {
      await query(
        `UPDATE payouts
            SET provider = $2, fallback_used = $3, mtn_status = $4,
                status = 'APPROVED', reference = $5, completed_at = NOW()
          WHERE id = $1 AND status = 'PROCESSING'`,
        [payoutId, provider, fallbackUsed, result.mtnStatus || null, result.reference || reference],
      );
      sendPayoutSms(
        { phone: storeRow.phone },
        { status: 'APPROVED', amount, destination, network, reference: result.reference || reference },
      ).catch(() => {});
      return res.status(200).json({
        message: `GHS ${amount.toFixed(2)} sent instantly to ${destination} (${network}) via ${provider}${fallbackUsed ? ' (MTN unavailable, Hubtel fallback)' : ''}.`,
        payout: { id: payoutId, status: 'APPROVED', reference: result.reference || reference },
        provider,
        fallbackUsed,
        dryRun: Boolean(result.dryRun),
      });
    }

    if (result.pending) {
      // Ambiguous: the gateway may still complete the transfer. Park the
      // funds for review instead of auto-refunding (which would double-pay
      // if the original leg lands) or marking FAILED (which would lose it).
      await query(
        `UPDATE payouts
            SET provider = $2, fallback_used = $3, mtn_status = $4,
                status = 'PENDING_REVIEW',
                failure_reason = 'Gateway result ambiguous (timeout/pending) - verify before settling.'
          WHERE id = $1 AND status = 'PROCESSING'`,
        [payoutId, provider, fallbackUsed, result.mtnStatus || null],
      );
      await query(
        `UPDATE stores
            SET available_balance = available_balance + $2,
                pending_balance = pending_balance + $2
          WHERE id = $1`,
        [req.auth.sub, amount],
      );
      return res.status(202).json({
        message: 'The provider did not confirm in time. Your payout is parked for review - no second attempt was made.',
        payout: { id: payoutId, status: 'PENDING_REVIEW' },
        provider,
        fallbackUsed,
        dryRun: Boolean(result.dryRun),
      });
    }

    // Definitive failure: nothing moved, so refund the reservation.
    await query(
      `UPDATE payouts
          SET provider = $2, fallback_used = $3, mtn_status = $4,
              status = 'FAILED', failure_reason = $5
        WHERE id = $1 AND status = 'PROCESSING'`,
      [payoutId, provider, fallbackUsed, result.mtnStatus || null, result.message || 'Gateway declined'],
    );
    await query(
      'UPDATE stores SET available_balance = available_balance + $2 WHERE id = $1',
      [req.auth.sub, amount],
    );
    return res.status(502).json({
      message: result.message || 'Disbursement failed. No funds were deducted.',
      payout: { id: payoutId, status: 'FAILED' },
      provider,
      fallbackUsed,
      dryRun: Boolean(result.dryRun),
    });
  } catch (err) {
    // Only the still-open reservation transaction is rolled back here. Once
    // the gateway call starts, the reservation is committed and the updates
    // above are the recovery path - a PROCESSING row is never silently lost.
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    client.release();
    next(err);
  }
});

/* --------------------------------- History ---------------------------------- */
router.get('/history', requireSeller, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, amount, destination, network, provider, fallback_used,
              mtn_status, status, reference, failure_reason,
              initiated_at, completed_at
         FROM payouts
        WHERE store_id = $1
        ORDER BY initiated_at DESC
        LIMIT 50`,
      [req.auth.sub],
    );
    res.json({ payouts: rows });
  } catch (err) {
    next(err);
  }
});

/* ------------------- Admin: settle a PENDING_REVIEW payout ------------------ */
router.post('/:payoutId/settle', requireAdmin, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const approve = req.body?.approve !== false;

    await client.query('BEGIN');
    const payoutRes = await client.query(
      `SELECT p.*, s.name AS store_name, s.phone AS store_phone
         FROM payouts p
         JOIN stores s ON s.id = p.store_id
        WHERE p.id = $1 AND p.status = 'PENDING_REVIEW'
        FOR UPDATE OF p`,
      [req.params.payoutId],
    );
    const payout = payoutRes.rows[0];
    if (!payout) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Pending payout not found.' });
    }

    if (!approve) {
      // Reject: return funds to available balance.
      await client.query(
        `UPDATE payouts SET status = 'FAILED', failure_reason = 'Rejected by admin review'
          WHERE id = $1`,
        [payout.id],
      );
      await client.query(
        `UPDATE stores
            SET pending_balance = pending_balance - $2,
                available_balance = available_balance + $2
          WHERE id = $1`,
        [payout.store_id, payout.amount],
      );
      await client.query('COMMIT');
      client.release();
      return res.json({ message: 'Payout rejected. Funds returned to available balance.' });
    }

    // Ambiguous payouts (gateway timed out but money may have moved) must be
    // verified out-of-band before anyone presses approve again - a second
    // disbursement would double-pay. Approve-only resolution here.
    if ((payout.failure_reason || '').includes('ambiguous')) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(409).json({
        error: 'This payout has an unverified gateway attempt. Confirm with the provider whether the first transfer landed, then approve (no retry) or reject to refund.',
      });
    }

    // Mark intent BEFORE the gateway moves money: if this process dies after
    // the provider pays but before the APPROVED update lands, the row reads
    // PROCESSING and the money is traceable instead of silent. The gateway
    // call itself happens after COMMIT so the row lock is never held across
    // network I/O.
    const settleRef = `GS-PAY-REV-${String(payout.id).slice(0, 8)}`;
    await client.query(
      `UPDATE payouts SET status = 'PROCESSING', reference = $2,
                          failure_reason = NULL WHERE id = $1`,
      [payout.id, payout.reference || settleRef],
    );
    await client.query('COMMIT');
    client.release();

    // Admin-approved large payout: MTN-first via the 2-way router, one
    // Hubtel retry when the MTN leg fails (same contract as instant cashouts).
    const result = await routeDisbursement({
      destination: payout.destination,
      amount: Number(payout.amount),
      network: payout.network,
      description: `${payout.store_name} reviewed cashout`,
      clientReference: payout.reference || settleRef,
    });
    const provider = result.provider || 'HUBTEL';

    if (result.success) {
      await query(
        `UPDATE payouts
            SET status='APPROVED', provider=$2, fallback_used=$3, mtn_status=$4,
                reference=$5, completed_at=NOW()
          WHERE id=$1`,
        [payout.id, provider, Boolean(result.fallback), result.mtnStatus || null, result.reference],
      );
      await query(
        `UPDATE stores SET pending_balance = pending_balance - $2 WHERE id = $1`,
        [payout.store_id, payout.amount],
      );
      sendPayoutSms(
        { phone: payout.store_phone },
        { status: 'APPROVED', reference: result.reference },
      ).catch(() => {});
      return res.json({
        message: `Payout approved and disbursed via ${provider}${result.fallback ? ' (MTN unavailable, Hubtel fallback)' : ''}.`,
        success: true,
        provider,
        fallbackUsed: Boolean(result.fallback),
      });
    }

    if (result.pending) {
      // Ambiguous here too: money may have moved, so keep the funds parked
      // in pending review rather than refunding (which could double-pay).
      await query(
        `UPDATE payouts
            SET status='PENDING_REVIEW', provider=$2, fallback_used=$3, mtn_status=$4,
                failure_reason='Gateway result ambiguous (timeout/pending) - verify before settling.'
          WHERE id=$1`,
        [payout.id, provider, Boolean(result.fallback), result.mtnStatus || null],
      );
      return res.status(202).json({
        message: 'The provider did not confirm in time. The payout stays parked for review - no second attempt was made.',
        success: false,
        provider,
        fallbackUsed: Boolean(result.fallback),
      });
    }

    await query(
      `UPDATE payouts
          SET status='FAILED', provider=$2, fallback_used=$3, mtn_status=$4,
              failure_reason=$5
        WHERE id=$1`,
      [payout.id, provider, Boolean(result.fallback), result.mtnStatus || null,
        result.message || 'Gateway declined'],
    );
    await query(
      `UPDATE stores
          SET pending_balance = pending_balance - $2,
              available_balance = available_balance + $2
        WHERE id = $1`,
      [payout.store_id, payout.amount],
    );
    return res.json({
      message: 'Payout failed at gateway; funds refunded to wallet.',
      success: false,
      provider,
      fallbackUsed: Boolean(result.fallback),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    client.release();
    next(err);
  }
});

export default router;


