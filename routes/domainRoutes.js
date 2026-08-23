/**
 * Ghana Stores - Custom Subdomain & Custom Domain Routing
 * MODULE 7:
 *  - Host-header middleware maps incoming requests to a tenant via
 *    stores.custom_domain OR stores.subdomain_slug.
 *  - Sellers attach custom domains; DNS (CNAME) instructions and dynamic
 *    SSL provisioning guidance (Caddy on-demand TLS) are returned inline.
 *  - Exposes the standard ACME/Caddy "ask" endpoint used to decide whether
 *    a certificate should be issued on demand.
 */
import { Router } from 'express';
import { query } from '../config/database.js';
import { requireSeller } from '../middleware/authMiddleware.js';

const router = Router();

const PLATFORM_DOMAIN = (process.env.PLATFORM_DOMAIN || 'ghastores.com').replace(/^https?:\/\//, '');
const ROOT_DOMAIN = (process.env.ROOT_DOMAIN || 'localhost:5173').split(':')[0];
const CNAME_TARGET = process.env.CNAME_TARGET || 'cname.ghastores.com';

const DOMAIN_RE = /^(\*\.)?([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;

/* ------------------------- Tenant resolution middleware ---------------------- */
export async function resolveStoreFromHost(req, _res, next) {
  try {
    req.storeFromHost = null;
    req.tenantInfo = { mode: 'platform', host: req.headers.host || '' };

    const rawHost = String(req.headers.host || '').toLowerCase().trim();
    const host = rawHost.split(':')[0];
    if (!host) return next();

    // Platform origins: localhost, LAN IPs, apex platform domain, www.
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    const isLocal = host === 'localhost' || host.endsWith('.localhost');
    const isPlatform = host === PLATFORM_DOMAIN || host === `www.${PLATFORM_DOMAIN}`;
    const isRootDev = !process.env.NODE_ENV && (isLocal || isIp);
    if (isIp || isPlatform || isRootDev) return next();

    // 1) Custom domains take precedence.
    const custom = await query(
      `SELECT id, name, subdomain_slug, custom_domain, whatsapp_number, phone,
              momo_number, status, currency, loyalty_points_per_ghs, loyalty_point_value
         FROM stores WHERE LOWER(custom_domain) = $1 AND status <> 'SUSPENDED' LIMIT 1`,
      [host],
    );
    if (custom.rows[0]) {
      req.storeFromHost = custom.rows[0];
      req.tenantInfo = { mode: 'custom_domain', host };
      return next();
    }

    // 2) Wildcard subdomains of the platform root (seller.slug.ghastores.com).
    if (host !== ROOT_DOMAIN && host.endsWith(`.${PLATFORM_DOMAIN}`)) {
      const sub = host.slice(0, -1 * (`.${PLATFORM_DOMAIN}`.length)).split('.')[0];
      if (sub && !['www', 'api', 'admin'].includes(sub)) {
        const found = await query(
          `SELECT id, name, subdomain_slug, custom_domain, whatsapp_number, phone,
                  momo_number, status, currency, loyalty_points_per_ghs, loyalty_point_value
             FROM stores WHERE subdomain_slug = $1 AND status <> 'SUSPENDED' LIMIT 1`,
          [sub],
        );
        if (found.rows[0]) {
          req.storeFromHost = found.rows[0];
          req.tenantInfo = { mode: 'subdomain', host, slug: sub };
        }
      }
    }
    return next();
  } catch (err) {
    // Never let DNS/DB hiccups take down the whole API.
    console.error('[domains] host resolution failed:', err.message);
    next();
  }
}

/* ------------------------------ Public resolution ---------------------------- */
// Lets the SPA ask "who owns the domain I am browsing?" (storefront header).
router.get('/resolve', async (req, res, next) => {
  try {
    if (!req.storeFromHost) {
      return res.json({ tenant: null, ...req.tenantInfo });
    }
    const s = req.storeFromHost;
    res.json({
      tenant: {
        id: s.id,
        name: s.name,
        subdomainSlug: s.subdomain_slug,
        customDomain: s.custom_domain,
        whatsappNumber: s.whatsapp_number,
        phone: s.phone,
        currency: s.currency,
      },
      ...req.tenantInfo,
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------- Public storefront catalog by slug --------------------- */
router.get('/storefront/:slug/products', async (req, res, next) => {
  try {
    const s = await query(
      `SELECT id, name, subdomain_slug, whatsapp_number, phone, momo_number, currency, status
         FROM stores WHERE subdomain_slug = $1 LIMIT 1`,
      [String(req.params.slug).toLowerCase()],
    );
    const store = s.rows[0];
    if (!store || store.status === 'SUSPENDED') {
      return res.status(404).json({ error: 'Storefront not found.' });
    }
    const products = await query(
      `SELECT p.id, p.name, p.description, p.category, p.image_url,
              COALESCE(json_agg(json_build_object(
                'id', v.id, 'optionName', v.option_name, 'optionValue', v.option_value,
                'price', COALESCE(v.price_override, p.price),
                'stockQuantity', v.stock_quantity
              ) ORDER BY v.option_name, v.option_value)
              FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
         FROM products p
         LEFT JOIN product_variants v ON v.product_id = p.id
        WHERE p.store_id = $1 AND p.is_active = TRUE
        GROUP BY p.id
        ORDER BY p.created_at DESC`,
      [store.id],
    );
    res.json({
      store: {
        name: store.name, slug: store.subdomain_slug, currency: store.currency,
        whatsappNumber: store.whatsapp_number, momoNumber: store.momo_number,
      },
      products: products.rows.map((p) => ({
        ...p,
        variants: p.variants.map((v) => ({ ...v, inStock: Number(v.stockQuantity) > 0 })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------- Seller: view own domain configuration ----------------- */
router.get('/my', requireSeller, async (req, res, next) => {
  try {
    const { rows } = await query(
      'SELECT subdomain_slug, custom_domain FROM stores WHERE id = $1',
      [req.auth.sub],
    );
    const store = rows[0];
    res.json({
      subdomain: `${store.subdomain_slug}.${PLATFORM_DOMAIN}`,
      subdomainSlug: store.subdomain_slug,
      customDomain: store.custom_domain,
      dns: {
        recordType: 'CNAME',
        host: '@ (or www)',
        target: CNAME_TARGET,
        ttl: 3600,
      },
      ssl: {
        mode: 'Automatic (Caddy on-demand TLS / NGINX certbot)',
        note: 'SSL is provisioned automatically once your CNAME resolves. Allow up to 10 minutes.',
      },
      caddyfile: [
        `${CNAME_TARGET}:443 {`,
        '  tls {',
        `    ask http://localhost:${process.env.PORT || 4000}/api/domains/caddy-ask`,
        '  }',
        '}',
      ].join('\n'),
    });
  } catch (err) {
    next(err);
  }
});

/* ---------------------- Seller: attach a custom domain ----------------------- */
router.put('/my', requireSeller, async (req, res, next) => {
  try {
    const domain = String(req.body?.customDomain || '').toLowerCase().trim().replace(/^https?:\/\//, '').split('/')[0];
    if (!domain) {
      // Clearing the domain.
      await query('UPDATE stores SET custom_domain = NULL WHERE id = $1', [req.auth.sub]);
      return res.json({ message: 'Custom domain removed.', customDomain: null });
    }
    if (!DOMAIN_RE.test(domain)) {
      return res.status(400).json({ error: 'Enter a valid domain, e.g. shop.mybrand.com' });
    }
    if (domain.endsWith(`.${PLATFORM_DOMAIN}`)) {
      return res.status(400).json({ error: 'Use the subdomain field for platform domains.' });
    }
    const taken = await query(
      'SELECT 1 FROM stores WHERE custom_domain = $1 AND id <> $2',
      [domain, req.auth.sub],
    );
    if (taken.rows.length > 0) {
      return res.status(409).json({ error: 'This domain is already connected to another store.' });
    }
    await query('UPDATE stores SET custom_domain = $2 WHERE id = $1', [req.auth.sub, domain]);
    res.json({
      message: 'Domain saved. Create the DNS record below; SSL provisions automatically.',
      customDomain: domain,
      dns: { recordType: 'CNAME', name: domain.split('.')[0] === 'www' ? 'www' : '@', target: CNAME_TARGET },
    });
  } catch (err) {
    next(err);
  }
});

/* ------------- Caddy on-demand TLS "ask" endpoint (infra hook) --------------- */
// Caddy calls this before issuing a certificate for an unknown domain.
router.get('/caddy-ask', async (req, res) => {
  try {
    const domain = String(req.query.domain || '').toLowerCase().trim();
    if (!DOMAIN_RE.test(domain)) return res.sendStatus(403);
    const { rows } = await query(
      'SELECT 1 FROM stores WHERE LOWER(custom_domain) = $1 LIMIT 1',
      [domain],
    );
    // 200 -> issue cert ; non-200 -> refuse.
    return res.sendStatus(rows.length > 0 ? 204 : 403);
  } catch {
    return res.sendStatus(503);
  }
});

export default router;

