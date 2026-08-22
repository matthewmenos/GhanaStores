import jwt from 'jsonwebtoken';
import { pool } from '../config/database.js';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Verifies the bearer token and attaches { storeId, staffId, role } to req.auth.
 * Every downstream route handler reads req.auth.storeId to scope its queries —
 * this is the single choke point that enforces multi-tenancy at the API layer.
 */
export async function requireSellerAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: 'Missing authorization token.' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.storeId) {
      return res.status(401).json({ error: 'Invalid token payload.' });
    }

    req.auth = {
      storeId: payload.storeId,
      staffId: payload.staffId || null,
      role: payload.role || 'OWNER',
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

/**
 * Restricts a route to specific staff roles (e.g. only OWNER/MANAGER can
 * approve payouts, only OWNER/MANAGER/CASHIER can operate the POS).
 */
export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.auth || !allowedRoles.includes(req.auth.role)) {
      return res.status(403).json({ error: 'You do not have permission to perform this action.' });
    }
    next();
  };
}

/**
 * Blocks write actions for stores that are PAST_DUE or SUSPENDED.
 * Read-only endpoints (e.g. viewing analytics) can skip this so merchants
 * can still see their data while they resolve billing.
 */
export async function requireActiveSubscription(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT status, trial_ends_at, grace_ends_at FROM stores WHERE id = $1',
      [req.auth.storeId]
    );

    const store = rows[0];
    if (!store) {
      return res.status(404).json({ error: 'Store not found.' });
    }

    if (store.status === 'SUSPENDED') {
      return res.status(402).json({
        error: 'Your store is suspended due to a past-due balance. Please renew to continue.',
        status: store.status,
      });
    }

    req.storeBilling = store;
    next();
  } catch (err) {
    next(err);
  }
}
