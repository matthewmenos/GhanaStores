/**
 * DiDwa - Billing & Onboarding Routes
 * MODULE 1: Zero-upfront registration -> automatic 14-day trial (DB trigger),
 * welcome SMS via Arkesel, subscription activation and lifecycle status.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { pool, query, withTransaction } from '../config/database.js';
import { issueStoreToken, requireSeller, requireAdmin } from '../middleware/authMiddleware.js';
import { sendWelcomeSms } from '../services/smsService.js';
import { normalizeGhPhone, slugifyStoreName } from '../utils/helpers.js';
import { routeCollection } from '../services/paymentRouter.js';
import { billingCronHandler } from './billingCronRoute.js';

const router = Router();

const PLANS = [
  { id: 'starter', name: 'Starter', priceGhs: 0, tagline: '14-day free trial',
    features: ['Storefront', 'POS', 'WhatsApp orders'] },
  { id: 'growth', name: 'Growth', priceGhs: 79, tagline: 'For growing shops',
    features: ['Custom domain', 'Loyalty engine', 'Rider reconciliation'] },
  { id: 'scale', name: 'Scale', priceGhs: 199, tagline: 'High-volume merchants',
    features: ['Priority payouts', 'Advanced analytics', 'Dedicated support'] },
];

/** Ensure the generated slug is unique; append numeric suffix on collision. */
async function uniqueSlug(base) {
  let candidate = base;
  for (let i = 2; i < 50; i += 1) {
    const { rows } = await query('SELECT 1 FROM stores WHERE subdomain_slug = $1', [candidate]);
    if (rows.length === 0) return candidate;
    candidate = `${base}-${i}`;
  }
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

/* ------------------------ Scheduled billing cycle (cron) -------------------- */
// Legacy alias; the canonical endpoint is GET /api/cron/billing (see
// billingCronRoute.js). Vercel Cron calls /api/cron/billing directly.
router.get('/cron', billingCronHandler);

/* --------------------------------- Register -------------------------------- */
router.post('/register', async (req, res, next) => {
  try {
    const { name, ownerName, email, phone, password, whatsappNumber, momoNumber } = req.body || {};

    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'Shop name, email, phone and password are required.' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const normPhone = normalizeGhPhone(phone);
    if (!normPhone) {
      return res.status(400).json({ error: 'Enter a valid Ghana mobile number (e.g. 0244123456).' });
    }
    const normWhatsapp = whatsappNumber ? (normalizeGhPhone(whatsappNumber) || null) : null;
    const normMomo = momoNumber ? (normalizeGhPhone(momoNumber) || null) : null;

    const emailLower = String(email).trim().toLowerCase();
    const dupe = await query('SELECT 1 FROM stores WHERE LOWER(email) = $1 LIMIT 1', [emailLower]);
    if (dupe.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const slug = await uniqueSlug(slugifyStoreName(name));
    const hash = await bcrypt.hash(password, 12);

    // trial_ends_at / grace_ends_at are stamped by trg_stores_auto_trial trigger.
    let store;
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const inserted = await withTransaction(async (t) =>
          t.query(
            `INSERT INTO stores (name, owner_name, email, phone, password_hash,
                                 subdomain_slug, whatsapp_number, momo_number)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
             RETURNING id, name, owner_name, email, phone, subdomain_slug, status, plan,
                       trial_ends_at, grace_ends_at, currency, custom_domain, created_at`,
            [String(name).trim(), ownerName ? String(ownerName).trim() : String(name).trim(),
              emailLower, normPhone, hash, attempt === 1 ? slug
                : await uniqueSlug(`${slug}-retry-${Math.random().toString(36).slice(2, 6)}`),
              normWhatsapp, normMomo],
          ));
        store = inserted.rows[0];
        break;
      } catch (err) {
        // Check-then-insert races (concurrent email/slug) surface as unique
        // violations - recheck and, for slugs, retry with a fresh suffix.
        if (err.code === '23505' && attempt < maxAttempts) {
          const again = await query('SELECT 1 FROM stores WHERE LOWER(email) = $1 LIMIT 1', [emailLower]);
          if (again.rows.length > 0) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
          }
          continue;
        }
        throw err;
      }
    }
    const token = issueStoreToken(store);

    // Welcome SMS (Module 1) - never blocks registration on gateway hiccups.
    sendWelcomeSms(store).catch(() => {});

    res.status(201).json({
      message: 'Store created. Your 14-day free trial has started.',
      token,
      store: { ...store, trial_days_left: 14 },
    });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------- Login ---------------------------------- */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await query(
      `SELECT id, name, owner_name, email, phone, password_hash, subdomain_slug, status, plan,
              trial_ends_at, grace_ends_at, currency, custom_domain, available_balance, pending_balance, created_at
         FROM stores WHERE LOWER(email) = $1 LIMIT 1`,
      [String(email).trim().toLowerCase()],
    );
    const store = rows[0];
    if (!store) return res.status(401).json({ error: 'Invalid email or password.' });

    const ok = await bcrypt.compare(password, store.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    delete store.password_hash;
    res.json({ token: issueStoreToken(store), store });
  } catch (err) {
    next(err);
  }
});

/* --------------------------- Trial status (countdown) ----------------------- */
router.get('/status', requireSeller, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, name, status, plan, trial_ends_at, grace_ends_at,
              GREATEST(0, EXTRACT(EPOCH FROM (trial_ends_at - NOW())) / 86400)::numeric(6,2) AS days_left
         FROM stores WHERE id = $1`,
      [req.auth.sub],
    );
    res.json({ billing: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Activate (pay) ------------------------------ */
// POST /api/billing/subscribe - charge the subscription through the 2-way
// MoMo router (MTN API first, Hubtel once on failure) and flip the store to
// ACTIVE only when the provider confirms. The seller pays from their own
// MoMo wallet, so destination === their number.
//
// Idempotency: every attempt carries a client-supplied `idempotencyKey`
// (default: one per request) so a retried tap on "Activate" cannot charge
// twice - a replayed key returns the outcome of the original attempt.
router.post('/subscribe', requireSeller, async (req, res, next) => {
  const client = await pool.connect();
  try {
    const planId = req.body?.planId || 'growth';
    const plan = PLANS.find((p) => p.id === planId) || PLANS[1];
    const network = String(req.body?.network || 'MTN').toUpperCase();
    const momoNumber = normalizeGhPhone(req.body?.momoNumber || req.body?.destination);

    if (!['MTN', 'VODAFONE', 'AT'].includes(network)) {
      client.release();
      return res.status(400).json({ error: 'Network must be MTN, VODAFONE (Telecel) or AT.' });
    }
    if (!momoNumber) {
      client.release();
      return res.status(400).json({ error: 'Enter the MoMo number the subscription should be charged from.' });
    }
    if (!plan || plan.priceGhs <= 0) {
      client.release();
      return res.status(400).json({ error: 'Choose a paid plan to subscribe (starter is the free trial).' });
    }

    await client.query('BEGIN');
    const lock = await client.query(
      'SELECT id, status, plan FROM stores WHERE id = $1 FOR UPDATE',
      [req.auth.sub],
    );
    const store = lock.rows[0];
    if (!store) {
      await client.query('ROLLBACK');
      client.release();
      return res.status(404).json({ error: 'Store not found.' });
    }
    if (store.status === 'SUSPENDED') {
      await client.query('ROLLBACK');
      client.release();
      return res.status(400).json({ error: 'Suspended accounts must contact support first.' });
    }
    await client.query('COMMIT');
    client.release();

    // Record the subscription attempt before the gateway call so a crash
    // after collection leaves an auditable PENDING row (never a silent ACTIVE).
    const reference = `GS-SUB-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const attempt = await query(
      `INSERT INTO subscription_payments
          (store_id, plan_id, amount, momo_number, network, provider, reference, status)
       VALUES ($1,$2,$3,$4,$5,'PENDING','PENDING',$6,'PENDING')
       RETURNING id`,
      [req.auth.sub, plan.id, plan.priceGhs, momoNumber, network, reference],
    );
    const attemptId = attempt.rows[0].id;

    const collected = await routeCollection({
      customerMsisdn: momoNumber,
      amount: plan.priceGhs,
      network,
      description: `DiDwa ${plan.name} plan - ${reference}`,
      clientReference: reference,
    });

    if (!collected.success) {
      await query(
        `UPDATE subscription_payments
            SET status = 'FAILED', provider = $2, failure_reason = $3
          WHERE id = $1`,
        [attemptId, collected.provider || 'HUBTEL', (collected.message || 'Collection declined').slice(0, 300)],
      );
      return res.status(402).json({
        error: collected.message || 'MoMo payment was not approved. Your plan was not changed.',
        provider: collected.provider || 'HUBTEL',
      });
    }

    // Provider confirmed: activate + close the payment row in one transaction.
    const done = await withTransaction(async (t) => {
      const activated = await t.query(
        `UPDATE stores
            SET status = 'ACTIVE', plan = $2
          WHERE id = $1 AND status <> 'SUSPENDED'
          RETURNING id, name, status, plan`,
        [req.auth.sub, plan.id],
      );
      if (!activated.rows[0]) {
        throw Object.assign(new Error('Store cannot be activated in its current state.'), { status: 400 });
      }
      await t.query(
        `UPDATE subscription_payments
            SET status = 'PAID', provider = $2,
                gateway_reference = $3, paid_at = NOW()
          WHERE id = $1`,
        [attemptId, collected.provider || 'HUBTEL', collected.reference || reference],
      );
      return activated.rows[0];
    });

    res.json({
      message: `${plan.name} plan activated for GHS ${plan.priceGhs.toFixed(2)} via ${collected.provider || 'HUBTEL'}. Your storefront stays live.`,
      store: done,
      provider: collected.provider || 'HUBTEL',
      dryRun: Boolean(collected.dryRun),
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* noop */ }
    try { client.release(); } catch { /* noop */ }
    next(err);
  }
});

/* --------------------------- Manual activation ---------------------------- */
// Direct activation is now an ADMIN override (support desk, manual bank
// transfer, comped plan). Sellers subscribe through POST /subscribe, which
// only activates after a confirmed MoMo collection.
router.post('/activate', requireAdmin, async (req, res, next) => {
  try {
    const storeId = req.body?.storeId || req.body?.store_id;
    if (!storeId) {
      return res.status(400).json({ error: 'storeId is required for manual activation.' });
    }
    const planId = req.body?.planId || 'growth';
    const plan = PLANS.find((p) => p.id === planId) || PLANS[1];
    const { rows } = await query(
      `UPDATE stores
          SET status = 'ACTIVE', plan = $2
        WHERE id = $1 AND status <> 'SUSPENDED'
        RETURNING id, name, status, plan`,
      [storeId, plan.id],
    );
    if (!rows[0]) {
      return res.status(400).json({ error: 'Store not found or suspended.' });
    }
    res.json({ message: `${plan.name} plan activated for ${rows[0].name}.`, store: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------- Plans ----------------------------------- */
router.get('/plans', (_req, res) => {
  res.json({ plans: PLANS, currency: 'GHS' });
});

export default router;

