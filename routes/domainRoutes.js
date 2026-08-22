import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../config/database.js';
import { requireSellerAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
const APP_BASE_DOMAIN = process.env.APP_BASE_DOMAIN || 'ghanastores.com';

/**
 * Middleware mounted at the app root (see server.js) that resolves the
 * incoming Host header to a tenant store — either a "<slug>.ghanastores.com"
 * subdomain or a verified custom domain — and attaches it to req.storefront
 * so storefront-facing routes can render the right tenant without a
 * store_id in the URL.
 */
export async function resolveStoreFromHost(req, res, next) {
  try {
    const host = (req.headers.host || '').split(':')[0].toLowerCase();

    if (host.endsWith(`.${APP_BASE_DOMAIN}`)) {
      const slug = host.replace(`.${APP_BASE_DOMAIN}`, '');
      const { rows } = await pool.query(
        `SELECT id, store_name, status FROM stores WHERE subdomain_slug = $1`,
        [slug]
      );
      req.storefront = rows[0] || null;
    } else {
      const { rows } = await pool.query(
        `SELECT id, store_name, status FROM stores WHERE custom_domain = $1 AND custom_domain_verified = TRUE`,
        [host]
      );
      req.storefront = rows[0] || null;
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/domains/custom
 * Registers a custom domain request. The store must point a CNAME at
 * storefronts.ghanastores.com; the platform's edge (Caddy/NGINX) then
 * provisions a Let's Encrypt certificate once DNS propagates and the
 * verification check below passes.
 */
router.post('/custom', requireSellerAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { domain } = z.object({ domain: z.string().min(3) }).parse(req.body);

    await pool.query(
      `UPDATE stores SET custom_domain = $2, custom_domain_verified = FALSE WHERE id = $1`,
      [req.auth.storeId, domain.toLowerCase()]
    );

    res.status(202).json({
      message: 'Custom domain saved. Point a CNAME record at storefronts.' + APP_BASE_DOMAIN + ' to finish setup.',
      cnameTarget: `storefronts.${APP_BASE_DOMAIN}`,
      domain,
    });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    next(err);
  }
});

/**
 * POST /api/domains/custom/verify
 * Called by an SSL-provisioning worker (Caddy on-demand TLS, or an
 * NGINX + certbot sidecar) once it has confirmed the CNAME resolves and
 * a certificate has been issued for the domain.
 */
router.post('/custom/verify', requireSellerAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE stores SET custom_domain_verified = TRUE
       WHERE id = $1 AND custom_domain IS NOT NULL
       RETURNING custom_domain`,
      [req.auth.storeId]
    );
    if (!rows[0]) return res.status(400).json({ error: 'No custom domain pending verification.' });

    res.json({ message: 'Custom domain verified and live.', domain: rows[0].custom_domain });
  } catch (err) {
    next(err);
  }
});

export default router;
