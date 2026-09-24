/**
 * DiDwa - JWT Authentication Middleware
 * Issues and verifies tokens for SELLER (store owner) and ADMIN (platform)
 * roles, and enforces tenant scoping + store status guards.
 */
import jwt from 'jsonwebtoken';
import { query } from '../config/database.js';

const TOKEN_TTL = '7d';
const DEV_SECRET = 'didwa-dev-secret';

/**
 * Resolve the signing secret once.
 *
 * Production MUST provide JWT_SECRET: a shipped default would let anyone forge
 * seller/admin tokens, so boot fails loudly instead of degrading silently.
 * Local development keeps the documented dev secret with a warning.
 */
const JWT_SECRET = (() => {
  const fromEnv = (process.env.JWT_SECRET || '').trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is required when NODE_ENV=production. Set it in the environment before starting DiDwa.',
    );
  }
  console.warn('[auth] JWT_SECRET is not set - signing with the development secret. Never deploy like this.');
  return DEV_SECRET;
})();

/* ---------------------------------- Issue ---------------------------------- */

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

export function issueStoreToken(store) {
  return signToken({
    sub: store.id,
    role: 'SELLER',
    email: store.email,
    slug: store.subdomain_slug,
    name: store.name,
  });
}

export function issueAdminToken(admin) {
  return signToken({
    sub: admin.id,
    role: 'ADMIN',
    email: admin.email,
    name: admin.name,
  });
}

/* ------------------------------ Verify & guard ----------------------------- */

/**
 * Tokens are read from the Authorization header ONLY. A `?token=` query
 * parameter was previously accepted, which leaked credentials into access
 * logs, browser history and Referer headers. Public receipt links use their
 * own HMAC share token instead (see routes/whatsappInvoiceRoutes.js).
 */
function readToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return null;
}

/** Hard requirement: valid JWT attached to the request. */
export function requireAuth(req, res, next) {
  const token = readToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  try {
    req.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
}

/**
 * Platform administrator only.
 *
 * The token's ADMIN role is not enough on its own: the subject must also exist
 * in `platform_admins`, so a leaked long-lived admin token can be revoked by
 * deleting (or rotating) the row and a hand-made token with role=ADMIN is
 * useless. Admins are created with `npm run admin:create` and sign in through
 * POST /api/admin/login.
 */
export async function requireAdmin(req, res, next) {
  const token = readToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required.' });
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Session expired or invalid. Please sign in again.' });
  }
  if (payload?.role !== 'ADMIN') {
    return res.status(403).json({ error: 'Platform administrator access required.' });
  }
  try {
    const { rows } = await query('SELECT id FROM platform_admins WHERE id = $1 LIMIT 1', [payload.sub]);
    if (!rows[0]) {
      return res.status(403).json({ error: 'This administrator account no longer has access.' });
    }
    req.auth = payload;
    return next();
  } catch (err) {
    return next(err);
  }
}


/**
 * Seller routes: loads the authenticated store onto req.store so downstream
 * handlers never have to trust client-supplied store_id values.
 */
export async function loadSellerStore(req, res, next) {
  try {
    const { rows } = await query(
      `SELECT id, name, email, phone, owner_name, subdomain_slug, custom_domain,
              status, plan, trial_ends_at, grace_ends_at, whatsapp_number, momo_number,
              available_balance, pending_balance, currency,
              loyalty_points_per_ghs, loyalty_point_value, created_at
         FROM stores WHERE id = $1 LIMIT 1`,
      [req.auth.sub],
    );
    if (!rows[0]) return res.status(401).json({ error: 'Store account not found.' });
    req.store = rows[0];
    next();
  } catch (err) {
    next(err);
  }
}

/** requireAuth + loadSellerStore combined for seller API mounts. */
export function requireSeller(req, res, next) {
  requireAuth(req, res, (err) => {
    if (err) return err;
    loadSellerStore(req, res, next);
  });
}

/**
 * Blocking gate for billing-sensitive actions (payouts, POS sales).
 * SUSPENDED stores are hard-blocked; PAST_DUE stores get a warning header
 * but remain operable during their grace period.
 */
export function requireOperationalStore(req, res, next) {
  if (!req.store) return res.status(500).json({ error: 'Store not loaded.' });
  if (req.store.status === 'SUSPENDED') {
    return res.status(403).json({
      error: 'Your store is suspended due to an expired subscription.',
      code: 'STORE_SUSPENDED',
      status: req.store.status,
    });
  }
  if (req.store.status === 'PAST_DUE') {
    res.setHeader('X-Billing-Status', 'PAST_DUE');
    res.setHeader('X-Warning', 'Subscription past due - settle before the grace period ends.');
  }
  next();
}

/** Convenience wrapper: seller auth + operational gate in one line. */
export function requireActiveSeller(req, res, next) {
  requireSeller(req, res, (err) => {
    if (err) return err;
    requireOperationalStore(req, res, next);
  });
}

export default {
  signToken,
  issueStoreToken,
  issueAdminToken,
  requireAuth,
  requireAdmin,
  requireSeller,
  requireActiveSeller,
};
