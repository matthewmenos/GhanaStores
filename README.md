# Ghana Stores

Multi-tenant e-commerce platform and seller PWA for merchants in Ghana and West Africa. Merchants register in seconds, get a 14-day free trial, and launch a storefront on a subdomain or their own custom domain — with inventory, analytics, offline POS, WhatsApp checkout, and instant Mobile Money payouts.

Deployed on **Vercel**, with Postgres via Vercel's built-in **Neon** integration.

## Stack

| Layer | Choice |
|---|---|
| Hosting | Vercel (static frontend + serverless API functions) |
| Server | Node.js + Express, run as a single serverless function (`api/index.js`) |
| Database | Neon Postgres via Vercel's Storage integration — row-level multi-tenancy via `store_id` |
| Frontend | React + Vite PWA, Tailwind CSS |
| Icons | Inline SVG + `lucide-react` only — no emoji anywhere in the UI |
| Payments / Payouts | Hubtel API (MoMo collection + disbursement) |
| SMS | Arkesel (transactional alerts) |
| Scheduling | Vercel Cron (daily billing sweep) |
| Domain | `ghanastores.com`, with merchant storefronts on `<slug>.ghanastores.com` or their own custom domain |

## Deploying to Vercel

1. **Attach Postgres.** In the Vercel dashboard, open the project → **Storage** → **Create Database** → **Neon (Postgres)**. This automatically injects `POSTGRES_URL` and `POSTGRES_URL_NON_POOLING` into every environment (Production, Preview, Development) — you don't set these by hand.

2. **Run the schema once** against that database:
   ```bash
   vercel env pull .env          # pulls POSTGRES_URL etc. down locally
   psql "$POSTGRES_URL_NON_POOLING" -f db/schema.sql
   ```

3. **Set the remaining environment variables** in Project Settings → Environment Variables:
   - `APP_BASE_DOMAIN=ghanastores.com`
   - `JWT_SECRET`
   - `HUBTEL_CLIENT_ID`, `HUBTEL_CLIENT_SECRET`, `HUBTEL_MERCHANT_ACCOUNT_NUMBER`, `HUBTEL_CALLBACK_URL`
   - `ARKESEL_API_KEY`
   - `CRON_SECRET` (Vercel automatically sends this as a bearer token when it calls the cron route — see below)
   - `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID` (and `VERCEL_TEAM_ID` if the project is under a team) — used by `routes/domainRoutes.js` to attach merchant custom domains programmatically via the Vercel API

4. **Add the domains:**
   - `ghanastores.com` as the project's Production Domain.
   - A **Wildcard Domain** `*.ghanastores.com` (Project Settings → Domains) so every merchant's `<slug>.ghanastores.com` subdomain resolves to this same deployment. Wildcard domains require a Vercel Pro or Enterprise plan.
   - Merchant custom domains are added on demand through `POST /api/domains/custom`, which calls the Vercel Domains API; Vercel then handles DNS verification and TLS issuance automatically — no Caddy/NGINX/certbot to run yourself.

5. **Push to deploy.** `vercel.json` already wires up the build (`vite build` → `dist/`), the API rewrite (`/api/*` → the Express app in `api/index.js`), and the daily cron:
   ```json
   { "crons": [{ "path": "/api/cron/billing", "schedule": "0 7 * * *" }] }
   ```
   `0 7 * * *` is UTC, which is the same as 07:00 in Accra (GMT, no DST) — no offset needed.

## Local development

```bash
npm install
vercel env pull .env        # or copy .env.example → .env and fill in POSTGRES_URL yourself
psql "$POSTGRES_URL_NON_POOLING" -f db/schema.sql

npm run dev                 # Express API on http://localhost:4000
npm run client:dev          # Vite dev server on http://localhost:5173, proxies /api to :4000
```

Run the billing sweep manually at any time with:
```bash
npm run cron:billing
```

## Directory layout

```
├── api/index.js                  Vercel serverless entry point — exports the Express app
├── vercel.json                   Rewrites, function config, and the daily cron schedule
├── config/database.js            @vercel/postgres pool (POSTGRES_URL) + tenant-scoped query helpers
├── middleware/authMiddleware.js  JWT auth, role checks, subscription gating
├── routes/
│   ├── analyticsRoutes.js        Revenue / AOV / monthly trend for Recharts
│   ├── billingRoutes.js          Trial status + renewal
│   ├── posRoutes.js              Offline POS sales + rider COD reconciliation
│   ├── payoutRoutes.js           Instant MoMo disbursement (Hubtel)
│   ├── whatsappInvoiceRoutes.js  Cart → WhatsApp deep link + PDF receipts
│   ├── inventoryRoutes.js        Variants, stock, low-stock SMS alerts
│   └── domainRoutes.js           Subdomain/custom-domain host resolution + Vercel Domains API
├── services/
│   ├── hubtelService.js          Hubtel collection & disbursement client
│   ├── smsService.js             Arkesel SMS client + message templates
│   └── pdfService.js             PDFKit + QR-code receipt generator
├── jobs/billingCron.js           Day-11 reminder → PAST_DUE → SUSPENDED sweep (called by /api/cron/billing)
├── db/schema.sql                 Full Postgres schema, triggers, indices
├── src/
│   ├── components/                TrialBanner, LoyaltyCheckout, POSCart, StatusBadge
│   └── pages/                     SellerAnalytics, SellerPOS, SellerPayouts, SellerInventory
└── server.js                     Express app, route mounts, host-based tenant resolution
```

## Multi-tenancy model

Every tenant-owned table carries a `store_id` column. `middleware/authMiddleware.js` decodes the seller's JWT into `req.auth.storeId` on every request, and route handlers use that value in every query — there is no cross-tenant query path. Buyer-facing storefront requests are resolved the other way: `routes/domainRoutes.js` exports `resolveStoreFromHost`, mounted at the app root in `server.js`, which maps the incoming `Host` header (either `<slug>.ghanastores.com` or a verified custom domain) to a `store_id`.

## Money handling

Wallet balances (`store_wallets`) split `available_balance`, `pending_balance`, and `rider_transit_balance`. Any operation that touches a balance — a payout request, a POS cash sale, a rider reconciliation — runs inside `withTransaction()` from `config/database.js` and takes a `SELECT ... FOR UPDATE` row lock before mutating, so concurrent requests can't double-spend the same balance. `@vercel/postgres` speaks Neon's serverless driver, which is safe to check clients in and out of from short-lived serverless functions (unlike a long-lived `pg.Pool`).

Payout requests at or below `PAYOUT_AUTO_APPROVE_THRESHOLD_GHS` (default GHS 5,000) are approved and disbursed to Mobile Money immediately via Hubtel; larger requests queue for manual review.

## Billing cron on Vercel

Vercel serverless functions are ephemeral, so there's no persistent process to self-schedule against — `jobs/billingCron.js` no longer uses `node-cron`. Instead, `vercel.json` registers a Vercel Cron job that hits `GET /api/cron/billing` once a day; that route (defined in `server.js`) verifies the `CRON_SECRET` bearer token Vercel sends and runs the sweep: Day-11 SMS reminder → `PAST_DUE` on Day 14 → `SUSPENDED` after the 3-day grace period.

## Design tokens

| Token | Hex | Use |
|---|---|---|
| Royal Blue | `#2563EB` | Primary / software credibility |
| Deep Slate | `#0F172A` → `#F8FAFC` | Admin background / structure |
| Emerald | `#059669` | Success / paid / active wallet |
| Amber | `#F59E0B` | Pending / grace period / low stock |
| Crimson | `#EF4444` | Alert / suspended / out of stock |
| Orange/Amber | `#EA580C` | Buyer storefront accent |

No emoji are used anywhere in the codebase — all status and iconography is `lucide-react` or hand-written inline SVG (see `src/components/UI/StatusBadge.jsx`).

## Not included in this scaffold

This is a production-shaped starting point, not a finished deployment. Still needed before going live: seller registration/auth endpoints (JWT issuance), the buyer-facing storefront app itself (this repo ships the seller dashboard), Hubtel/Arkesel webhook signature verification, and automated tests.
