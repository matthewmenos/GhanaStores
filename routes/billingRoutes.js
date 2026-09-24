/**
 * DiDwa - Billing & Onboarding Routes
 * MODULE 1: Zero-upfront registration -> automatic 14-day trial (DB trigger),
 * welcome SMS via Arkesel, subscription activation and lifecycle status.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../config/database.js';
import { issueStoreToken, requireSeller } from '../middleware/authMiddleware.js';
import { sendWelcomeSms } from '../services/smsService.js';
import { normalizeGhPhone, slugifyStoreName } from '../utils/helpers.js';
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
    const inserted = await withTransaction(async (t) =>
      t.query(
        `INSERT INTO stores (name, owner_name, email, phone, password_hash,
                             subdomain_slug, whatsapp_number, momo_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, name, owner_name, email, phone, subdomain_slug, status, plan,
                   trial_ends_at, grace_ends_at, currency, created_at`,
        [String(name).trim(), ownerName ? String(ownerName).trim() : String(name).trim(),
          emailLower, normPhone, hash, slug, normWhatsapp, normMomo],
      ));
    const store = inserted.rows[0];
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
              trial_ends_at, grace_ends_at, currency, available_balance, pending_balance, created_at
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
// Production: swap for a Hubtel checkout callback that calls this internally
// once the subscription charge is confirmed.
router.post('/activate', requireSeller, async (req, res, next) => {
  try {
    const planId = req.body?.planId || 'growth';
    const plan = PLANS.find((p) => p.id === planId) || PLANS[1];
    const { rows } = await query(
      `UPDATE stores
          SET status = 'ACTIVE', plan = $2
        WHERE id = $1 AND status <> 'SUSPENDED'
        RETURNING id, name, status, plan`,
      [req.auth.sub, plan.id],
    );
    if (!rows[0]) {
      return res.status(400).json({ error: 'Suspended accounts must contact support first.' });
    }
    res.json({ message: `${plan.name} plan activated. Your storefront stays live.`, store: rows[0] });
  } catch (err) {
    next(err);
  }
});

/* ---------------------------------- Plans ----------------------------------- */
router.get('/plans', (_req, res) => {
  res.json({ plans: PLANS, currency: 'GHS' });
});

export default router;

