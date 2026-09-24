/**
 * DiDwa - Platform Admin Routes
 *
 *   POST /api/admin/login   email + password -> ADMIN token (platform_admins)
 *   GET  /api/admin/me      current admin profile
 *   POST /api/admin/admins  create another administrator (existing admin only)
 *
 * Admins authenticate against the `platform_admins` table (bcrypt hashes)
 * instead of a hand-minted token, and requireAdmin re-checks that the token
 * subject still exists - so admin access can be revoked server-side.
 */
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/database.js';
import { issueAdminToken, requireAdmin } from '../middleware/authMiddleware.js';
import { verifyDomainStatus } from '../services/domainService.js';

const router = Router();

const publicAdmin = (row) => ({
  id: row.id,
  email: row.email,
  name: row.name,
  createdAt: row.created_at,
});

/* ----------------------------------- Login --------------------------------- */
router.post('/login', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const { rows } = await query(
      'SELECT id, email, name, password_hash, created_at FROM platform_admins WHERE LOWER(email) = $1 LIMIT 1',
      [email],
    );
    const admin = rows[0];
    // Same generic message for unknown email and bad password (no enumeration).
    if (!admin) return res.status(401).json({ error: 'Invalid email or password.' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    res.json({ token: issueAdminToken(admin), admin: publicAdmin(admin) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------------ Me ----------------------------------- */
router.get('/me', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT id, email, name, created_at FROM platform_admins WHERE id = $1 LIMIT 1',
      [req.auth.sub],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Administrator not found.' });
    res.json({ admin: publicAdmin(rows[0]) });
  } catch (err) {
    next(err);
  }
});

/* ------------------------------ Create admin ------------------------------- */
router.post('/admins', requireAdmin, async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = req.body?.name ? String(req.body.name).trim() : null;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }
    if (password.length < 10) {
      return res.status(400).json({ error: 'Admin passwords must be at least 10 characters.' });
    }

    const hash = await bcrypt.hash(password, 12);
    const { rows } = await query(
      `INSERT INTO platform_admins (email, password_hash, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                         name = COALESCE(EXCLUDED.name, platform_admins.name)
       RETURNING id, email, name, created_at`,
      [email, hash, name],
    );
    res.status(201).json({ message: 'Administrator saved.', admin: publicAdmin(rows[0]) });
  } catch (err) {
    next(err);
  }
});
/* ------------------------------ Admin overview ----------------------------- */
router.get('/overview', requireAdmin, async (_req, res, next) => {
  try {
    const [metrics, tenants, domains, transactions, gateways] = await Promise.all([
      query(`SELECT
          COALESCE((SELECT SUM(total) FROM orders WHERE status IN ('PAID','FULFILLED','DELIVERED')), 0) AS total_revenue,
          (SELECT COUNT(*) FROM stores WHERE status <> 'SUSPENDED') AS active_merchants,
          (SELECT COUNT(*) FROM store_domains WHERE status = 'ACTIVE') AS active_domains,
          (SELECT COUNT(*) FROM store_domains WHERE status IN ('FAILED','CANCELLED')) AS action_required`),
      query(`SELECT id, name, email, subdomain_slug, custom_domain, status, plan, created_at
               FROM stores ORDER BY created_at DESC`),
      query(`SELECT d.id, d.domain_name, d.provider, d.status, d.ssl_status,
                    d.purchase_reference, d.verification_errors, d.created_at,
                    s.name AS store_name, s.subdomain_slug
               FROM store_domains d JOIN stores s ON s.id = d.store_id
              ORDER BY d.created_at DESC`),
      query(`SELECT sp.id, sp.store_id, sp.amount, sp.momo_number, sp.network,
                    sp.provider, sp.reference, sp.gateway_reference, sp.status,
                    sp.failure_reason, sp.initiated_at, s.name AS store_name
               FROM subscription_payments sp JOIN stores s ON s.id = sp.store_id
              ORDER BY sp.initiated_at DESC LIMIT 250`),
      query(`SELECT provider, status, COUNT(*)::int AS count
               FROM subscription_payments GROUP BY provider, status`),
    ]);
    res.json({ metrics: metrics.rows[0], tenants: tenants.rows, domains: domains.rows, transactions: transactions.rows, gateways: gateways.rows });
  } catch (err) { next(err); }
});

router.patch('/tenants/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const status = String(req.body?.status || '').toUpperCase();
    if (!['TRIAL', 'ACTIVE', 'SUSPENDED'].includes(status)) return res.status(400).json({ error: 'Invalid tenant status.' });
    const { rows } = await query('UPDATE stores SET status = $2 WHERE id = $1 RETURNING id, name, status', [req.params.id, status]);
    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found.' });
    res.json({ tenant: rows[0] });
  } catch (err) { next(err); }
});

router.post('/domains/:id/retry', requireAdmin, async (req, res, next) => {
  try {
    const { rows } = await query('SELECT id, domain_name FROM store_domains WHERE id = $1 AND status IN (\'FAILED\',\'CANCELLED\') LIMIT 1', [req.params.id]);
    const domain = rows[0];
    if (!domain) return res.status(409).json({ error: 'Domain is not eligible for retry.' });
    const result = await verifyDomainStatus(domain.domain_name);
    const status = ['ACTIVE', 'PENDING_DNS', 'FAILED'].includes(result.status) ? result.status : 'FAILED';
    const { rows: updated } = await query(
      `UPDATE store_domains
          SET status = $2, ssl_status = COALESCE($3, ssl_status),
              custom_hostname_id = COALESCE($4, custom_hostname_id),
              verification_errors = COALESCE($5, verification_errors), updated_at = NOW()
        WHERE id = $1 RETURNING id, domain_name, status, ssl_status, custom_hostname_id`,
      [domain.id, status, result.ssl?.status || null, result.customHostnameId || null, JSON.stringify(result.verificationErrors || [])],
    );
    res.json({ domain: updated[0], message: status === 'ACTIVE' ? 'Domain verified and activated.' : 'Domain verification refreshed.' });
  } catch (err) { next(err); }
});



export default router;
