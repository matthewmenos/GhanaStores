# Ghana Stores

Multi-tenant e-commerce platform and seller PWA for merchants in Ghana and West Africa. Merchants register in seconds, get a 14-day free trial, and launch a storefront on a subdomain or their own custom domain — with inventory, analytics, offline POS, WhatsApp checkout, and instant Mobile Money payouts.

## Stack

| Layer | Choice |
|---|---|
| Server | Node.js + Express (modular routes/services) |
| Database | Neon PostgreSQL — row-level multi-tenancy via `store_id` |
| Frontend | React + Vite PWA, Tailwind CSS |
| Icons | Inline SVG + `lucide-react` only — no emoji anywhere in the UI |
| Payments / Payouts | Hubtel API (MoMo collection + disbursement) |
| SMS | Arkesel (transactional alerts) |

## Getting started

```bash
npm install
cp .env.example .env        # fill in DATABASE_URL, Hubtel & Arkesel keys

# Provision the schema on your Neon database
psql "$DATABASE_URL" -f db/schema.sql

# Run the API
npm run dev                 # http://localhost:4000

# Run the seller PWA (separate terminal)
npm run client:dev          # http://localhost:5173, proxies /api to :4000
```

The billing cron (`jobs/billingCron.js`) is imported by `server.js` and self-schedules with `node-cron` at 07:00 Africa/Accra. Run it once on demand with:

```bash
node jobs/billingCron.js --now
```

## Directory layout

```
├── config/database.js            Neon connection pool + tenant-scoped query helpers
├── middleware/authMiddleware.js  JWT auth, role checks, subscription gating
├── routes/
│   ├── analyticsRoutes.js        Revenue / AOV / monthly trend for Recharts
│   ├── billingRoutes.js          Trial status + renewal
│   ├── posRoutes.js              Offline POS sales + rider COD reconciliation
│   ├── payoutRoutes.js           Instant MoMo disbursement (Hubtel)
│   ├── whatsappInvoiceRoutes.js  Cart → WhatsApp deep link + PDF receipts
│   ├── inventoryRoutes.js        Variants, stock, low-stock SMS alerts
│   └── domainRoutes.js           Subdomain/custom-domain host resolution
├── services/
│   ├── hubtelService.js          Hubtel collection & disbursement client
│   ├── smsService.js             Arkesel SMS client + message templates
│   └── pdfService.js             PDFKit + QR-code receipt generator
├── jobs/billingCron.js           Day-11 reminder → PAST_DUE → SUSPENDED sweep
├── db/schema.sql                 Full Neon schema, triggers, indices
├── src/
│   ├── components/               TrialBanner, LoyaltyCheckout, POSCart, StatusBadge
│   └── pages/                    SellerAnalytics, SellerPOS, SellerPayouts, SellerInventory
└── server.js                     Express app, route mounts, host-based tenant resolution
```

## Multi-tenancy model

Every tenant-owned table carries a `store_id` column. `middleware/authMiddleware.js` decodes the seller's JWT into `req.auth.storeId` on every request, and route handlers use that value in every query — there is no cross-tenant query path. Buyer-facing storefront requests are resolved the other way: `routes/domainRoutes.js` exports `resolveStoreFromHost`, mounted at the app root in `server.js`, which maps the incoming `Host` header (either `<slug>.ghanastores.com` or a verified custom domain) to a `store_id`.

## Money handling

Wallet balances (`store_wallets`) split `available_balance`, `pending_balance`, and `rider_transit_balance`. Any operation that touches a balance — a payout request, a POS cash sale, a rider reconciliation — runs inside `withTransaction()` from `config/database.js` and takes a `SELECT ... FOR UPDATE` row lock before mutating, so concurrent requests can't double-spend the same balance.

Payout requests at or below `PAYOUT_AUTO_APPROVE_THRESHOLD_GHS` (default GHS 5,000) are approved and disbursed to Mobile Money immediately via Hubtel; larger requests queue for manual review.

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

This is a production-shaped starting point, not a finished deployment. Still needed before going live: seller registration/auth endpoints (JWT issuance), the buyer-facing storefront app itself (this repo ships the seller dashboard), Hubtel/Arkesel webhook signature verification, Caddy/NGINX on-demand TLS wiring for custom domains, and automated tests.
