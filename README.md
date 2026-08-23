# Ghana Stores

Multi-tenant e-commerce platform and seller Progressive Web App (PWA) built for
the Ghanaian and West African market. All money values are Ghana Cedi (GHS).

Non-technical merchants register in seconds, receive a 14-day free trial, launch
a storefront on a subdomain or custom domain, manage multi-variant inventory,
sell in-store or online, accept Mobile Money and cash, and cash out instantly
via MTN, Telecel/Vodafone or AT Money.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Runtime / API | Node.js, Express.js (ESM, modular routers) |
| Database | Neon PostgreSQL (row-level multi-tenancy via `store_id`) |
| Frontend | React 18 + Vite PWA, Tailwind CSS, Recharts |
| Icons | Pure inline SVG components + Lucide-style strokes (zero emojis) |
| Payments | Hubtel API (MoMo collection + disbursement, dry-run fallback) |
| SMS | Arkesel API (transactional + alerts, dry-run fallback) |
| PDF | PDFKit receipts with QR verification codes |
| Scheduler | node-cron (Africa/Accra timezone) |

## Quick Start

```bash
npm install            # install all dependencies
cp .env.example .env   # then edit values (see below)
npm run db:init        # apply db/schema.sql to your database
npm run db:seed        # optional demo store + catalog + orders
node server.js         # API on http://localhost:4000
npm run dev            # seller PWA on http://localhost:5173
```

Demo login after seeding: `demo@ghastores.com` / `ghanastores1`

## Environment Variables (.env)

| Key | Purpose | Fallback behaviour |
| --- | --- | --- |
| `DATABASE_URL` | Neon/Postgres connection string | Local PG via PGHOST/PGUSER/... |
| `JWT_SECRET` | Token signing for sellers/admins | Dev default (change in production) |
| `HUBTEL_CLIENT_ID` / `HUBTEL_CLIENT_SECRET` | Hubtel payments + payouts | Dry-run mode (simulated success) |
| `HUBTEL_MOMO_DISBURSEMENT_MERCHANT_ACCOUNT` | Payout merchant account number | Required for live payouts |
| `ARKESEL_API_KEY` | Arkesel transactional SMS | Dry-run mode (logged, not sent) |
| `RISK_THRESHOLD_GHS` | Payouts at/above this need admin review | `5000` |
| `PORT` | API port | `4000` |
| `PLATFORM_DOMAIN` | Platform apex domain for subdomains | `ghastores.com` |
| `CNAME_TARGET` | CNAME target shown to sellers | `cname.ghastores.com` |
| `ENABLE_CRON` | Start the billing scheduler | `false` |
| `CLIENT_URL` | CORS origin for the PWA | `*` |

Without gateway keys the platform runs fully in dry-run: payments simulate
success, SMS is logged to the server console. Perfect for local development.

## Project Structure

```
config/database.js            Neon pool, withTransaction(), pingDb()
middleware/authMiddleware.js  JWT seller/admin guards
routes/
  billingRoutes.js            Registration, login, trial status, plans
  analyticsRoutes.js          KPIs + 6-month Recharts series
  posRoutes.js                POS sales, loyalty, rider COD reconciliation
  payoutRoutes.js             Instant MoMo cashout + admin review
  whatsappInvoiceRoutes.js    Buyer checkout, order lifecycle, PDF receipts
  inventoryRoutes.js          Products, variants, stock, low-stock SMS
  domainRoutes.js             Host resolution, custom domains, Caddy ask
services/
  hubtelService.js            MoMo collection + disbursement
  smsService.js               Arkesel templates (welcome, trial, payout, stock)
  pdfService.js               PDFKit receipt with QR code
jobs/billingCron.js           Day 11 reminder / Day 14 PAST_DUE / Day 17 suspend
db/schema.sql                 Tables, indexes, auto-trial trigger
scripts/dbInit.js             Schema applier (npm run db:init)
scripts/dbSeed.js             Demo data (npm run db:seed)
scripts/e2eTest.js            Full 37-assertion end-to-end suite
src/                          React PWA (pages, components, SVG icons)
public/                       manifest.webmanifest, sw.js, favicon.svg
```

## Platform Modules

| # | Module | Where | Highlights |
| --- | --- | --- | --- |
| 1 | 14-day free trial | `routes/billingRoutes.js`, `jobs/billingCron.js`, DB trigger | Auto `trial_ends_at` on register, Arkesel welcome SMS, Day 11 reminder, Day 14 PAST_DUE, Day 17 suspend |
| 2 | Analytics & loyalty | `routes/analyticsRoutes.js`, `src/pages/SellerAnalytics.jsx`, `LoyaltyCheckout.jsx` | Revenue/AOV/paid-orders KPIs, 6-month Recharts trend, points per GHS with checkout redemption |
| 3 | Instant payouts | `routes/payoutRoutes.js`, `hubtelService.js` | `available_balance` vs `pending_balance`, `SELECT ... FOR UPDATE` locking, instant Hubtel disbursement under GHS 5,000, admin review above |
| 4 | Offline POS & COD | `routes/posRoutes.js`, `SellerPOS.jsx`, `POSCart.jsx` | Cash/MoMo register sales, atomic stock decrement, Rider Transit Balance with one-click reconciliation |
| 5 | WhatsApp & PDF invoices | `routes/whatsappInvoiceRoutes.js`, `pdfService.js` | Cart-to-`wa.me` structured payload, stock reservation, cancel-restock, PDFKit receipts with QR verification tokens |
| 6 | Variants & low-stock SMS | `routes/inventoryRoutes.js`, `SellerInventory.jsx` | Multi-option variants (size/colour/SKU), custom thresholds, alert latch prevents duplicate SMS, re-arms after restock |
| 7 | Domains & SSL | `routes/domainRoutes.js` | Host-header tenant resolution (`custom_domain` or `subdomain_slug`), CNAME instructions, Caddy on-demand TLS `/api/domains/caddy-ask` |

## API Surface

```
POST   /api/billing/register          Register store (trial auto-starts)
POST   /api/billing/login             Seller login -> JWT
GET    /api/billing/status            Trial countdown + lifecycle state
GET    /api/analytics/dashboard       KPIs, monthlyTrend, recentOrders, operations
GET    /api/pos/loyalty/:phone        Points balance + redeemable GHS value
POST   /api/pos/sales                 Log POS sale (CASH/MOMO) - decrements stock
POST   /api/pos/riders/dispatch       Hand COD orders to a rider
POST   /api/pos/riders/:id/reconcile  Move transit cash into wallet
GET    /api/payouts/summary           Wallet balances + payout stats
POST   /api/payouts/request           Instant MoMo cashout (row-locked)
POST   /api/orders/storefront/checkout Buyer cart -> order + WhatsApp deep link
PATCH  /api/orders/:id/status         PAID (wallet+loyalty) / CANCELLED (restock)
GET    /api/orders/:id/receipt        PDF receipt (seller JWT or ?token= HMAC share link)
GET    /api/inventory/products        Catalog with variants
PATCH  /api/inventory/variants/:id/stock  Adjust stock (delta or absolute)
GET    /api/inventory/low-stock       Below-threshold report
GET    /api/domains/my                Subdomain, custom domain, DNS + Caddyfile
PUT    /api/domains/my                Attach/remove custom domain
GET    /api/domains/caddy-ask?domain= On-demand TLS gate for Caddy
GET    /health                        Liveness + DB connectivity probe
```

All seller/admin routes require `Authorization: Bearer <jwt>`. Every query is
scoped by `store_id` from the token - cross-tenant reads are impossible by
construction (verified in the e2e suite).

## Testing

```bash
node scripts/e2eTest.js    # 37 assertions across all 7 modules
```

The suite registers two fresh stores and asserts: trial trigger + welcome SMS,
catalog creation, POS sale with loyalty redemption, oversell rejection (409),
instant payout with balance debit, large-payout review queue, WhatsApp checkout
to PAID with wallet credit, cancellation restock, PDF receipt magic bytes,
custom-domain attach plus Caddy ask 204/403, and strict tenant isolation.

## Production Notes

- Serve the API behind Caddy with `on_demand_tls { ask ... }` pointed at
  `/api/domains/caddy-ask`; wildcard `*.ghastores.com` plus per-store custom
  domains then receive certificates automatically.
- Set `ENABLE_CRON=true` on exactly one instance so billing jobs run once.
- Swap the dry-run gateway modes for live keys in `.env` when ready;
  no code changes are needed.

## Deploy on Vercel

The repo ships with Vercel configuration in place - no scaffolding needed:

| Concern | File / mechanism |
| --- | --- |
| Frontend (PWA) | `npm run build` emits `dist/`, served from Vercel's edge |
| Backend (Express) | `api/index.js` wraps the whole modular app in one Node function |
| API routing | `vercel.json` rewrites `/api/(.*)` and `/health` to that function |
| SPA fallback | `/(.*)` rewrites to `/index.html`; static assets in `dist/` win first |
| Billing cron | Vercel Cron calls `/api/billing/cron` daily at `0 8 * * *` (UTC = Ghana GMT) |
| DB pool | `config/database.js` auto-tunes for Vercel (`PGPOOL_MAX=3`, smaller gateway timeouts) |

### 1. Push the repo to GitHub and import it in Vercel

Vercel auto-detects the framework (Other), the build command (`npm run build`)
and the output directory (`dist`). No code changes required.

### 2. Set environment variables (Project Settings -> Environment Variables)

| Key | Value |
| --- | --- |
| `DATABASE_URL` | **Neon pooled** connection string (`-pooler`) so many serverless instances share the connection budget |
| `JWT_SECRET` | Long random string (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `CRON_SECRET` | Long random string - Vercel sends it as `Authorization: Bearer` on cron hits |
| `HUBTEL_CLIENT_ID` / `HUBTEL_CLIENT_SECRET` / `HUBTEL_MERCHANT_ACCOUNT` | Live MoMo keys (omit to stay in dry-run) |
| `ARKESEL_API_KEY` | Live SMS key (omit to stay in dry-run) |
| `PLATFORM_DOMAIN` | Your Vercel app domain, e.g. `ghana-store.vercel.app` (no protocol) |
| `PLATFORM_URL` | `https://ghana-store.vercel.app` (used for PDF verification links) |

### 3. Cron job & auth

`vercel.json` declares the cron under `crons: [{ path: "/api/billing/cron", schedule: "0 8 * * *" }]`.
Vercel includes `Authorization: Bearer <CRON_SECRET>` automatically **when the
`CRON_SECRET` variable exists on the project**, and the endpoint rejects
requests without the correct secret. The daily run executes the full billing
cycle: day-11 renewal reminders, day-14 `PAST_DUE`, and day-17 suspension.

### 4. Customer domains on Vercel

- Add the apex platform domain to your Vercel project and create a wildcard
  `*.yourdomain.com` CNAME to `cname.vercel-dns.com`.
- The tenant resolver (`routes/domainRoutes.js`) still maps the Host header to
  `stores.custom_domain` or `stores.subdomain_slug`, so each storefront works
  the same way it did under Caddy. TLS is fully automatic via Vercel.

### 5. Serverless caveats (already handled)

- **Balance safety** - wallet rows are locked with `SELECT ... FOR UPDATE`, and
  gateway failures are handled inside the same transaction, so double-spend is
  impossible even on concurrent invocations.
- **Timeout budget** - live Hubtel and Arkesel calls get an 8s cap inside
  Vercel (Hobby functions die at 10s), while local runs keep the full 15-25s.
- **Local manifest** - `public/sw.js` + `public/manifest.webmanifest` are
  copied verbatim into `dist/`, so the installed PWA works identically on the
  Vercel deployment URL.
- On a Pro plan you may raise the ceiling via
  `vercel.json` -> `"functions": { "api/index.js": { "maxDuration": 30 } }`.

> Tip: run `npx vercel` locally for a preview deployment; every push to your
> git branch redeploys automatically.

