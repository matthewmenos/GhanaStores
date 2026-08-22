import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';

import analyticsRoutes from './routes/analyticsRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import posRoutes from './routes/posRoutes.js';
import payoutRoutes from './routes/payoutRoutes.js';
import whatsappInvoiceRoutes from './routes/whatsappInvoiceRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import domainRoutes, { resolveStoreFromHost } from './routes/domainRoutes.js';
import { runDailyBillingSweep } from './jobs/billingCron.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const IS_VERCEL = process.env.VERCEL === '1';

// ---- Core middleware ----
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Resolves the incoming Host header (subdomain or verified custom domain)
// to a tenant store on every request — powers the buyer-facing storefront.
app.use(resolveStoreFromHost);

// Basic API-wide rate limiting; payout/billing routes could layer on
// stricter limits if needed.
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 300 }));

// ---- Health check ----
app.get('/healthz', (req, res) => res.json({ ok: true, app: 'Ghana Stores API' }));

/**
 * GET /api/cron/billing
 * Invoked once a day by Vercel Cron (see vercel.json). Vercel serverless
 * functions are ephemeral — there's no long-running process to self-
 * schedule against — so the platform's own cron scheduler is what
 * triggers this instead of node-cron.
 *
 * When CRON_SECRET is set, Vercel signs scheduled invocations with
 * `Authorization: Bearer <CRON_SECRET>`; we verify that so this endpoint
 * can't be hit by anyone who finds the URL.
 */
app.get('/api/cron/billing', async (req, res, next) => {
  try {
    if (process.env.CRON_SECRET) {
      const authHeader = req.headers.authorization || '';
      if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized.' });
      }
    }
    const summary = await runDailyBillingSweep();
    res.json({ ok: true, ...summary });
  } catch (err) {
    next(err);
  }
});

// ---- Modular route mounts ----
app.use('/api/analytics', analyticsRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/whatsapp', whatsappInvoiceRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/domains', domainRoutes);

// ---- 404 ----
app.use((req, res) => res.status(404).json({ error: 'Route not found.' }));

// ---- Centralized error handler ----
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    error: statusCode === 500 ? 'Internal server error.' : err.message,
  });
});

// Only bind a listening port for local dev / traditional hosting.
// On Vercel, api/index.js imports `app` and Vercel's Node runtime calls
// it directly as a request handler for every /api/* invocation.
if (!IS_VERCEL) {
  app.listen(PORT, () => {
    console.log(`Ghana Stores API listening on port ${PORT}`);
  });
}

export default app;
