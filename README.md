# DiDwa

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
| Payments | 2-way: MTN MoMo API first for MTN numbers (collections + disbursements, status polling), Hubtel for Telecel/AT + one-time fallback (dry-run fallback per provider) |
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

Demo login after seeding: `demo@didwa.com` / `didwa1`

## Environment Variables (.env)

| Key | Purpose | Fallback behaviour |
| --- | --- | --- |
| `DATABASE_URL` | Neon/Postgres connection string | Local PG via PGHOST/PGUSER/... |
| `JWT_SECRET` | Token signing for sellers/admins | Dev default (change in production) |
| `MTN_MOMO_SUBSCRIPTION_KEY` / `MTN_MOMO_COLLECTION_USER_ID` / `MTN_MOMO_COLLECTION_API_KEY` | MTN MoMo collections + disbursements (primary for MTN numbers) | MTN dry-run mode (simulated success) |
| `MTN_MOMO_TARGET_ENVIRONMENT` | `sandbox` vs `mtn-ghana` | `sandbox` |
| `PAYMENT_FALLBACK_ENABLED` | Retry failed MTN legs once via Hubtel | `true` |
| `HUBTEL_CLIENT_ID` / `HUBTEL_CLIENT_SECRET` | Hubtel fallback + Telecel/AT traffic | Dry-run mode (simulated success) |
| `HUBTEL_MOMO_DISBURSEMENT_MERCHANT_ACCOUNT` | Payout merchant account number | Required for live payouts |
| `ARKESEL_API_KEY` | Arkesel transactional SMS | Dry-run mode (logged, not sent) |
| `RISK_THRESHOLD_GHS` | Payouts at/above this need admin review | `5000` |
| `PORT` | API port | `4000` |
| `PLATFORM_DOMAIN` | Platform apex domain for subdomains | `didwaghana.com` |
| `PLATFORM_URL` | Public origin for PDF/QR verification links | `https://didwaghana.com` |
| `ROOT_DOMAIN` | Apex used by the Host resolver (dev: `localhost:5173`) | `didwaghana.com` |
| `CNAME_TARGET` | CNAME target shown to sellers | `cname.vercel-dns.com` on Vercel; else `cname.<PLATFORM_DOMAIN>` |
| `VITE_PLATFORM_DOMAIN` | Browser-side apex domain for subdomains (seller PWA) | `VITE_`-prefixed mirror of `PLATFORM_DOMAIN` (`didwaghana.com`) |
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
  mtnMomoService.js           MTN MoMo collections + disbursements (status polling)
  paymentRouter.js            2-way routing: MTN-first, one Hubtel retry on failure
  hubtelService.js            Telecel/AT traffic + Hubtel fallback leg
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
| 3 | Instant payouts | `routes/payoutRoutes.js`, `paymentRouter.js`, `mtnMomoService.js`, `hubtelService.js` | `available_balance` vs `pending_balance`, `SELECT ... FOR UPDATE` locking, MTN-first disbursement under GHS 5,000 with one Hubtel retry on failure, `provider`/`fallback_used` recorded per payout, admin review above |
| 4 | Offline POS & COD | `routes/posRoutes.js`, `SellerPOS.jsx`, `POSCart.jsx` | Cash/MoMo register sales (MoMo collections are MTN-first with Hubtel fallback), atomic stock decrement, Rider Transit Balance with one-click reconciliation |
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

- **Vercel + Cloudflare (current setup):** `didwaghana.com` and
  `*.didwaghana.com` live in the Cloudflare zone; the wildcard is proxied so
  storefront subdomains get HTTPS from Cloudflare Universal SSL. Set SSL/TLS to
  Full (strict). See "Domain, DNS and customer domains" below for records.
- **Self-hosted alternative:** serve the API behind Caddy with
  `on_demand_tls { ask ... }` pointed at `/api/domains/caddy-ask`; wildcard
  `*.didwaghana.com` plus per-store custom domains then receive certificates
  automatically.
- Set `ENABLE_CRON=true` on exactly one instance so billing jobs run once.
  On Vercel this is unnecessary - the platform Cron hits `/api/cron/billing`.
- Swap the dry-run gateway modes for live keys in `.env` when ready
  (MTN MoMo for MTN numbers, Hubtel for Telecel/AT + fallback);
  no code changes are needed.

## Deploy on Vercel

The repo ships with Vercel configuration in place - no scaffolding needed:

| Concern | File / mechanism |
| --- | --- |
| Frontend (PWA) | `npm run build` emits `dist/`, served from Vercel's edge |
| Backend (Express) | `api/index.js` wraps the whole modular app in one Node function |
| API routing | `vercel.json` rewrites `/api/(.*)` and `/health` to that function |
| SPA fallback | `/(.*)` rewrites to `/index.html`; static assets in `dist/` win first |
| Billing cron | Vercel Cron calls `/api/cron/billing` daily (`0 0 * * *` per `vercel.json`; the in-process scheduler uses 08:00 Africa/Accra when `ENABLE_CRON=true`) |
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
| `MTN_MOMO_SUBSCRIPTION_KEY` / `MTN_MOMO_COLLECTION_USER_ID` / `MTN_MOMO_COLLECTION_API_KEY` | Live MTN MoMo keys (omit to keep MTN in dry-run) |
| `MTN_MOMO_TARGET_ENVIRONMENT` | `sandbox` for testing, `mtn-ghana` for live traffic |
| `ARKESEL_API_KEY` | Live SMS key (omit to stay in dry-run) |
| `PLATFORM_DOMAIN` | Platform apex domain, `didwaghana.com` (no protocol) |
| `VITE_PLATFORM_DOMAIN` | Same value - baked into the browser bundle at build time, so redeploy after changing it |
| `PLATFORM_URL` | `https://didwaghana.com` (used for PDF verification links) |
| `ROOT_DOMAIN` | `didwaghana.com` (apex used by the Host-header resolver) |
| `CNAME_TARGET` | `cname.vercel-dns.com` (what sellers CNAME their own domain to) |

### 3. Cron job & auth

`vercel.json` declares the cron under `crons: [{ path: "/api/billing/cron", schedule: "0 8 * * *" }]`.
Vercel includes `Authorization: Bearer <CRON_SECRET>` automatically **when the
`CRON_SECRET` variable exists on the project**, and the endpoint rejects
requests without the correct secret. The daily run executes the full billing
cycle: day-11 renewal reminders, day-14 `PAST_DUE`, and day-17 suspension.

### 4. Domain, DNS and customer domains (didwaghana.com on Cloudflare + Vercel)

Add both the apex and the wildcard to the Vercel project (Project -> Settings ->
Domains): `didwaghana.com` and `*.didwaghana.com`. Then create the DNS records
in the Cloudflare zone:

| Type | Name | Content | Proxy | Why |
| --- | --- | --- | --- | --- |
| A | `@` (didwaghana.com) | `76.76.21.21` (use the value on the Vercel domain card) | DNS only for the simplest setup | Apex cannot be a CNAME |
| CNAME | `www` | `cname.vercel-dns.com` | DNS only | Vercel provisions the certificate |
| CNAME | `*` | `cname.vercel-dns.com` | **Proxied (orange cloud)** | Storefront subdomains (`slug.didwaghana.com`) |

Two ways to get SSL on the wildcard, and they are mutually exclusive:

- **Cloudflare proxy (recommended here).** Keep the zone's nameservers at
  Cloudflare and leave the `*` record proxied. Cloudflare Universal SSL covers
  `didwaghana.com` and `*.didwaghana.com` (one level), so storefront subdomains
  are served over HTTPS. Set SSL/TLS mode to **Full (strict)** - the default
  "Flexible" mode causes redirect loops against Vercel - and remove any `AAAA`
  records for the apex.
- **Vercel nameservers.** Vercel only issues its own wildcard certificates when
  the zone is delegated to `ns1.vercel-dns.com` / `ns2.vercel-dns.com`, because
  the DNS-01 challenge needs control of the zone. Choose this if you want Vercel
  to manage every certificate; the domain then leaves Cloudflare DNS.

Notes:

- `CNAME_TARGET=cname.vercel-dns.com` so the DNS instructions sellers see in
  `/api/domains/my` point at Vercel. The app default is
  `cname.<PLATFORM_DOMAIN>`, which only resolves if you create that record.
- The tenant resolver (`middleware/domainMiddleware.js`) maps the `Host` header
  to `stores.custom_domain` or `stores.subdomain_slug`, so storefronts work the
  same behind Cloudflare or Vercel - both preserve the `Host` header.
- Sellers bringing their own domain get a CNAME to `cname.vercel-dns.com`, and
  `POST /api/domains/verify` accepts Vercel's canonical target and apex IPs.
- The Cloudflare-for-SaaS flow in `services/domainService.js`
  (`CLOUDFLARE_ZONE_ID` + `CLOUDFLARE_API_TOKEN`) now targets the real
  `didwaghana.com` zone, so keep the zone on Cloudflare if you want that
  automated custom-hostname provisioning.

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

