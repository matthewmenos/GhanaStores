/**
 * DiDwa - Multi-Tenant domain resolution middleware (MODULE 7)
 *
 * Inspects `req.headers.host` on EVERY request and resolves the tenant:
 *   1. Platform subdomain   (slug.didwaghana.com) -> stores.subdomain_slug
 *   2. Custom domain        (kofifashion.com)     -> stores.custom_domain
 *
 * System root domains (apex, www, app, api) are platform traffic: they set
 * `req.isPlatformRoot = true` and continue WITHOUT querying the database.
 *
 * The matching store is attached as `req.tenantStore` (legacy alias
 * `req.storeFromHost`) plus a `req.tenantInfo` descriptor.
 */
import { query } from '../config/database.js';

const platformDomain = () =>
  (process.env.PLATFORM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '').split(':')[0];

/** Subdomain labels that always belong to the platform, never to a seller. */
const RESERVED_SUBDOMAINS = new Set(['www', 'app', 'api', 'admin']);

/** Columns consumed by the storefront + WhatsApp order flows. */
const TENANT_COLUMNS = `id, name, subdomain_slug, custom_domain, whatsapp_number,
  phone, momo_number, status, currency, loyalty_points_per_ghs, loyalty_point_value`;

/** Normalises a Host header into a bare lowercase hostname (port stripped). */
export function normalizeHost(rawHost) {
  return String(rawHost || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split('?')[0]
    .split(':')[0]
    .replace(/\.+$/, '');
}

/**
 * Classifies a host with no database access.
 * @returns {{host, isPlatformRoot, isIp, isLocal, slug, isPlatformSubdomain}}
 */
export function classifyHost(rawHost) {
  const host = normalizeHost(rawHost);
  const plat = platformDomain();
  const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
  const isLocal = host === 'localhost' || host.endsWith('.localhost');

  if (!host) {
    return { host: '', isPlatformRoot: true, isIp, isLocal, slug: null, isPlatformSubdomain: false };
  }
  if (plat && host === plat) {
    return { host, isPlatformRoot: true, isIp, isLocal, slug: null, isPlatformSubdomain: false };
  }
  if (plat && host.endsWith(`.${plat}`)) {
    const label = host.slice(0, -(plat.length + 1));
    // Reserved labels, and deeper nesting (a.b.didwaghana.com), are platform.
    const reserved = RESERVED_SUBDOMAINS.has(label) || label.includes('.');
    return {
      host,
      isPlatformRoot: reserved,
      isIp,
      isLocal,
      slug: reserved ? null : label,
      isPlatformSubdomain: !reserved,
    };
  }
  if (isLocal || isIp) {
    return { host, isPlatformRoot: true, isIp, isLocal, slug: null, isPlatformSubdomain: false };
  }
  return { host, isPlatformRoot: false, isIp, isLocal, slug: null, isPlatformSubdomain: false };
}

/** Only public storefront traffic may 404; API and health must pass through. */
function isStorefrontRequest(req) {
  const path = req.path || '';
  if (path.startsWith('/api') || path === '/health') return false;
  return String(req.headers?.accept || '').includes('text/html');
}

/**
 * Resolve the tenant from the Host header and attach it to the request.
 * Runs before every route. Never throws: a DB hiccup degrades to
 * "unresolved" rather than taking the whole API down.
 *
 * @param deps.query - injectable query function (defaults to the real one).
 *                     Exists so resolution can be unit-tested without a live DB.
 */
export async function resolveTenantStore(req, res, next, deps = {}) {
  const runQuery = deps.query || query;

  req.tenantStore = null;
  req.storeFromHost = null;
  req.isPlatformRoot = false;
  req.tenantInfo = { mode: 'platform', host: String(req.headers.host || '') };

  try {
    const { host, isPlatformRoot, slug } = classifyHost(req.headers.host);

    // System root domain: never query the database for a storefront.
    if (isPlatformRoot) {
      req.isPlatformRoot = true;
      req.tenantInfo = { mode: 'platform', host, isPlatformRoot: true };
      return next();
    }

    // 1) Platform subdomain -> stores.subdomain_slug
    if (slug) {
      const found = await runQuery(
        `SELECT ${TENANT_COLUMNS}
           FROM stores
          WHERE LOWER(subdomain_slug) = $1 AND status <> 'SUSPENDED'
          LIMIT 1`,
        [slug],
      );
      if (found.rows[0]) {
        req.tenantStore = found.rows[0];
        req.storeFromHost = req.tenantStore;
        req.tenantInfo = { mode: 'subdomain', host, isPlatformRoot: false, slug };
        return next();
      }
    }

    // 2) Custom domain -> stores.custom_domain
    const custom = await runQuery(
      `SELECT ${TENANT_COLUMNS}
         FROM stores
        WHERE LOWER(custom_domain) = $1 AND status <> 'SUSPENDED'
        LIMIT 1`,
      [host],
    );
    if (custom.rows[0]) {
      req.tenantStore = custom.rows[0];
      req.storeFromHost = req.tenantStore;
      req.tenantInfo = { mode: 'custom_domain', host, isPlatformRoot: false };
      return next();
    }

    // 3) No active tenant owns this host.
    req.tenantInfo = { mode: 'unresolved', host, isPlatformRoot: false, slug };

    // Only storefront traffic 404s; platform/API traffic continues untouched.
    if (res && typeof res.status === 'function' && isStorefrontRequest(req)) {
      return res.status(404).json({ error: 'Storefront not found', host });
    }
    return next();
  } catch (err) {
    console.error('[domains] tenant resolution failed:', err.message);
    req.tenantInfo = { mode: 'error', host: String(req.headers.host || ''), isPlatformRoot: false };
    if (res && typeof res.status === 'function' && isStorefrontRequest(req)) {
      return res.status(503).json({ error: 'Storefront temporarily unavailable' });
    }
    return next();
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