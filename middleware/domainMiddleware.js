/**
 * DiDwa - Multi-Tenant domain resolution middleware (MODULE 7)
 *
 * Inspects req.headers.host on EVERY request and resolves the tenant:
 *   1. Custom domain        (shop.mybrand.com)     -> stores.custom_domain
 *   2. Platform subdomain   (slug.didwaghana.com)  -> stores.subdomain_slug
 *
 * The matching store is attached as `req.tenantStore` (with the legacy
 * `req.storeFromHost` alias kept for existing routes) plus a `req.tenantInfo`
 * descriptor. Platform origins (localhost, LAN IPs, the apex platform domain,
 * www, api/admin subdomains) pass through untouched so the seller dashboard
 * and API never get accidentally tenanted.
 *
 * Vercel forwards the `Host` header unchanged, so this single middleware lets
 * one serverless function serve every storefront plus the dashboard.
 */
import { query } from '../config/database.js';

const platformDomain = () =>
  (process.env.PLATFORM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '');
const rootDomain = () => (process.env.ROOT_DOMAIN || 'localhost:5173').split(':')[0];

/** Columns consumed by the storefront + WhatsApp order flows. */
const TENANT_COLUMNS = `id, name, subdomain_slug, custom_domain, whatsapp_number,
  phone, momo_number, status, currency, loyalty_points_per_ghs, loyalty_point_value`;

/**
 * Resolve the tenant from the Host header and attach it to the request.
 * Runs before every route; never throws (DNS/DB hiccups fall through).
 */
export async function resolveTenantStore(req, _res, next) {
  try {
    req.tenantStore = null;
    req.tenantInfo = { mode: 'platform', host: req.headers.host || '' };

    const rawHost = String(req.headers.host || '').toLowerCase().trim();
    const host = rawHost.split(':')[0];
    if (!host) return next();

    // Platform / dev origins.
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const isLocal = host === 'localhost' || host.endsWith('.localhost');
    const plat = platformDomain();
    const isPlatform = host === plat || host === `www.${plat}`;
    const isDevRoot = !process.env.NODE_ENV && (isLocal || isIp);
    if (isIp || isPlatform || isDevRoot) return next();

    // 1) Custom domains take precedence.
    const custom = await query(
      `SELECT ${TENANT_COLUMNS}
         FROM stores WHERE LOWER(custom_domain) = $1 AND status <> 'SUSPENDED' LIMIT 1`,
      [host],
    );
    if (custom.rows[0]) {
      req.tenantStore = custom.rows[0];
      req.tenantInfo = { mode: 'custom_domain', host };
      return next();
    }

    // 2) Wildcard subdomains of the platform domain.
    if (host !== rootDomain() && host.endsWith(`.${plat}`)) {
      const slug = host.slice(0, -1 * (`.${plat}`.length)).split('.')[0];
      if (slug && !['www', 'api', 'admin'].includes(slug)) {
        const found = await query(
          `SELECT ${TENANT_COLUMNS}
             FROM stores WHERE subdomain_slug = $1 AND status <> 'SUSPENDED' LIMIT 1`,
          [slug],
        );
        if (found.rows[0]) {
          req.tenantStore = found.rows[0];
          req.tenantInfo = { mode: 'subdomain', host, slug };
        }
      }
    }
    return next();
  } catch (err) {
    // Never let DNS/DB hiccups take down the whole API.
    console.error('[domains] tenant resolution failed:', err.message);
    next();
  }
}

/** Backward-compatible alias mapping the legacy `req.storeFromHost` name. */
export function resolveStoreFromHost(req, res, next) {
  return resolveTenantStore(req, res, (err) => {
    if (err) return next(err);
    req.storeFromHost = req.tenantStore || null;
    next();
  });
}

export default { resolveTenantStore, resolveStoreFromHost };