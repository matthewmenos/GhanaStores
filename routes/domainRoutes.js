import { Router } from 'express';
import { z } from 'zod';
import axios from 'axios';
import { pool } from '../config/database.js';
import { requireSellerAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();
const APP_BASE_DOMAIN = process.env.APP_BASE_DOMAIN || 'ghanastores.com';

// Talks to the Vercel REST API to attach a merchant's custom domain to
// this project, so Vercel provisions and renews the TLS certificate
// automatically — no Caddy/NGINX/certbot to run ourselves.
const {
  VERCEL_API_TOKEN,
  VERCEL_PROJECT_ID,
  VERCEL_TEAM_ID, // optional — only needed if the project sits in a team
} = process.env;

const vercelApi = axios.create({
  baseURL: 'https://api.vercel.com',
  headers: { Authorization: `Bearer ${VERCEL_API_TOKEN}` },
  timeout: 10_000,
});

function vercelTeamParams() {
  return VERCEL_TEAM_ID ? { teamId: VERCEL_TEAM_ID } : {};
}

/**
 * Middleware mounted at the app root (see server.js) that resolves the
 * incoming Host header to a tenant store — either a "<slug>.ghanastores.com"
 * subdomain or a verified custom domain — and attaches it to req.storefront
 * so storefront-facing routes can render the right tenant without a
 * store_id in the URL.
 *
 * Serving "<slug>.ghanastores.com" for every merchant requires a
 * Wildcard Domain (*.ghanastores.com) attached to this Vercel project —
 * add it under Project Settings > Domains. Wildcard domains are a
 * Vercel Pro/Enterprise feature.
 */
export async function resolveStoreFromHost(req, res, next) {
  try {
    const host = (req.headers.host || '').split(':')[0].toLowerCase();

    if (host === APP_BASE_DOMAIN || host === `www.${APP_BASE_DOMAIN}`) {
      // Marketing site / seller dashboard itself — not a storefront request.
      req.storefront = null;
    } else if (host.endsWith(`.${APP_BASE_DOMAIN}`)) {
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
 * Registers a custom domain request and attaches it to this Vercel
 * project via the Domains API. Vercel then either issues the cert
 * immediately (if DNS already points at Vercel) or returns the DNS
 * records the merchant still needs to add.
 */
router.post('/custom', requireSellerAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { domain } = z.object({ domain: z.string().min(3) }).parse(req.body);
    const normalizedDomain = domain.toLowerCase();

    await pool.query(
      `UPDATE stores SET custom_domain = $2, custom_domain_verified = FALSE WHERE id = $1`,
      [req.auth.storeId, normalizedDomain]
    );

    let vercelResponse = null;
    try {
      const { data } = await vercelApi.post(
        `/v10/projects/${VERCEL_PROJECT_ID}/domains`,
        { name: normalizedDomain },
        { params: vercelTeamParams() }
      );
      vercelResponse = data;
    } catch (apiErr) {
      // Domain saved locally even if the Vercel API call fails (e.g. rate
      // limit) — /custom/verify can be retried once DNS/API issues clear.
      console.error('[domainRoutes] Vercel domain attach failed:', apiErr.response?.data || apiErr.message);
    }

    res.status(202).json({
      message: 'Custom domain saved. Point a CNAME record at cname.vercel-dns.com (or the A/TXT records shown below) to finish setup.',
      cnameTarget: 'cname.vercel-dns.com',
      domain: normalizedDomain,
      vercel: vercelResponse
        ? { verified: vercelResponse.verified, verification: vercelResponse.verification }
        : null,
    });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors });
    next(err);
  }
});

/**
 * POST /api/domains/custom/verify
 * Re-checks the domain's verification status with Vercel. Once DNS has
 * propagated, Vercel marks it verified and issues the TLS certificate —
 * we just mirror that status onto the store row.
 */
router.post('/custom/verify', requireSellerAuth, requireRole('OWNER'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT custom_domain FROM stores WHERE id = $1`,
      [req.auth.storeId]
    );
    const domain = rows[0]?.custom_domain;
    if (!domain) return res.status(400).json({ error: 'No custom domain on file for this store.' });

    const { data } = await vercelApi.get(
      `/v9/projects/${VERCEL_PROJECT_ID}/domains/${domain}`,
      { params: vercelTeamParams() }
    );

    if (!data.verified) {
      return res.status(409).json({
        message: 'Domain is not verified with Vercel yet.',
        verification: data.verification,
      });
    }

    await pool.query(
      `UPDATE stores SET custom_domain_verified = TRUE WHERE id = $1`,
      [req.auth.storeId]
    );

    res.json({ message: 'Custom domain verified and live.', domain });
  } catch (err) {
    next(err);
  }
});

export default router;
