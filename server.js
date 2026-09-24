/**
 * DIDWA - Root Express Application
 * Multi-tenant e-commerce platform & seller PWA API for Ghana (GHS).
 *
 * Dual-mode boot:
 *   - Direct run (`node server.js` / `npm start`): binds PORT, boots the
 *     in-process node-cron scheduler.
 *   - Imported by the Vercel serverless entry point (api/index.js): exports
 *     the app untouched; Vercel's edge router supplies static hosting and
 *     scheduled invocations replace the local scheduler.
 *
 * Modular mounts:
 *   /api/billing     14-day trial engine, auth, subscription, cron webhook
 *   /api/analytics   Sales KPIs + Recharts series
 *   /api/pos         Offline POS sales, rider COD reconciliation
 *   /api/payouts     Instant Hubtel MoMo disbursements
 *   /api/orders      WhatsApp commerce + PDF receipts
 *   /api/inventory   Multi-variant stock + low-stock SMS
 *   /api/domains     Subdomain / custom-domain routing + SSL hook
 */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import { pingDb } from './config/database.js';
import { resolveTenantStore } from './middleware/domainMiddleware.js';
import billingRoutes from './routes/billingRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import posRoutes from './routes/posRoutes.js';
import payoutRoutes from './routes/payoutRoutes.js';
import whatsappInvoiceRoutes, { whatsappRouter } from './routes/whatsappInvoiceRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import domainRoutes from './routes/domainRoutes.js';
import { webhookRouter } from './routes/domainRoutes.js';
import billingCronRoute from './routes/billingCronRoute.js';
import themeRoutes from './routes/themeRoutes.js';
import orderRoutes from './routes/orderRoutes.js';
import { startBillingCron } from './jobs/billingCron.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 4000);
const ON_VERCEL = Boolean(process.env.VERCEL);

/* --------------------------------- Core middleware -------------------------- */
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: process.env.CLIENT_URL || '*',
  credentials: false,
}));

/* ------------------- Tenant resolution must run FIRST ----------------------- */
// Maps custom domains / subdomains to req.tenantStore (legacy alias
// req.storeFromHost) for public storefront traffic; platform requests pass
// through untouched.
app.use(resolveTenantStore);

/* --------------------------------- API mounts ------------------------------- */
app.get('/health', async (_req, res) => {
  try {
    const now = await pingDb();
    res.json({ ok: true, service: 'didwa-api', db: 'connected', at: now.now });
  } catch {
    res.status(503).json({
      ok: false,
      service: 'didwa-api',
      db: 'unreachable',
      hint: 'Set DATABASE_URL and apply db/schema.sql (npm run db:init).',
    });
  }
});

app.use('/api/billing', billingRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/orders', whatsappInvoiceRoutes);
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/domains', domainRoutes);
app.use('/api/cron', billingCronRoute);
// Hubtel payment webhook — must be at /api/webhooks/hubtel (called by Hubtel infra)
app.use('/api/webhooks', webhookRouter);
// Theme catalog + storefront theme management (mounted at /api so that
// /api/themes and /api/store/theme/* resolve as written).
app.use('/api', themeRoutes);
// Order management: public checkout + seller fulfillment console.
app.use('/api', orderRoutes);

app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

/* ------------------------- Production SPA serving ---------------------------- */
// Self-hosted mode only. On Vercel, static files are served by the edge from
// dist/ and rewrites in vercel.json keep non-API paths away from this function.
if (process.env.NODE_ENV === 'production' && !ON_VERCEL) {
  const dist = path.join(__dirname, 'dist');
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

/* --------------------------------- Errors ------------------------------------ */
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('[server] unhandled error:', err.message);
  if (res.headersSent) return;
  res.status(err.status || 500).json({ error: err.message || 'Internal server error.' });
});

/* --------------------------------- Boot -------------------------------------- */
// Only bind a port + start the scheduler when executed directly. Under Vercel
// (or any serverless wrapper importing this module) the platform owns the
// socket, and scheduled jobs arrive via GET /api/billing/cron instead.
const invokedDirectly = Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly && !ON_VERCEL) {
  app.listen(PORT, () => {
    console.log(`DiDwa API listening on port ${PORT}`);
  });

  // Boot-time connectivity check is informational only - the API stays up so
  // health probes work even when Neon is briefly unreachable.
  pingDb()
    .then(() => console.log('[db] Neon PostgreSQL connected.'))
    .catch(() => console.warn(
      '[db] WARNING: database not reachable yet. Apply db/schema.sql via `npm run db:init`.',
    ));

  startBillingCron();
}

// Exported for the Vercel serverless entry point (api/index.js).
export default app;

