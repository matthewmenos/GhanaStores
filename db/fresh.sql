-- ============================================================
-- DIDWA - Neon PostgreSQL Schema
-- Row-Level Multi-Tenancy: every tenant table carries store_id.
-- Apply with: npm run db:init   (or psql -f db/fresh.sql)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------ stores (tenants)
CREATE TABLE IF NOT EXISTS stores (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  owner_name            TEXT,
  email                 TEXT NOT NULL,
  phone                 TEXT NOT NULL,                -- normalized 233XXXXXXXXX
  password_hash         TEXT NOT NULL,
  subdomain_slug        TEXT NOT NULL UNIQUE
                          CHECK (subdomain_slug ~ '^[a-z0-9][a-z0-9-]{2,39}$'),
  custom_domain         TEXT UNIQUE,
  whatsapp_number       TEXT,
  momo_number           TEXT,
  status                TEXT NOT NULL DEFAULT 'TRIAL'
                          CHECK (status IN ('TRIAL','ACTIVE','PAST_DUE','SUSPENDED')),
  plan                  TEXT NOT NULL DEFAULT 'starter',
  trial_ends_at         TIMESTAMPTZ,
  grace_ends_at         TIMESTAMPTZ,
  available_balance     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (available_balance >= 0),
  pending_balance       NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (pending_balance >= 0),
  loyalty_points_per_ghs NUMERIC(6,2) NOT NULL DEFAULT 1.00,  -- points per whole GHS spent
  loyalty_point_value    NUMERIC(6,4) NOT NULL DEFAULT 0.0500, -- GHS discount per point
  currency              TEXT NOT NULL DEFAULT 'GHS',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS stores_email_lower_idx ON stores ((LOWER(email)));
CREATE INDEX IF NOT EXISTS stores_status_trial_idx ON stores (status, trial_ends_at);

-- MODULE 1: automatic 14-day free trial on registration.
CREATE OR REPLACE FUNCTION set_store_trial_period() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := NOW() + INTERVAL '14 days';
  END IF;
  IF NEW.grace_ends_at IS NULL THEN
    NEW.grace_ends_at := NEW.trial_ends_at + INTERVAL '3 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stores_auto_trial ON stores;
CREATE TRIGGER trg_stores_auto_trial
  BEFORE INSERT ON stores
  FOR EACH ROW EXECUTE FUNCTION set_store_trial_period();

-- ------------------------------------------------------------ catalog
CREATE TABLE IF NOT EXISTS products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  category      TEXT DEFAULT 'General',
  price         NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (price >= 0),
  image_url     TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS products_store_idx ON products (store_id, created_at DESC);

-- MODULE 6: multi-variant inventory with custom re-order thresholds.
CREATE TABLE IF NOT EXISTS product_variants (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id             UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id           UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_name          TEXT NOT NULL DEFAULT 'Default',   -- e.g. Size / Colour
  option_value         TEXT NOT NULL,                     -- e.g. XL / Red
  sku                  TEXT,
  price_override       NUMERIC(12,2),                     -- falls back to product price
  stock_quantity       INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold  INTEGER NOT NULL DEFAULT 5,
  low_stock_alert_sent BOOLEAN NOT NULL DEFAULT FALSE,    -- guards duplicate SMS alerts
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, option_name, option_value)
);
CREATE INDEX IF NOT EXISTS variants_store_idx ON product_variants (store_id);
CREATE INDEX IF NOT EXISTS variants_low_stock_idx
  ON product_variants (store_id)
  WHERE stock_quantity <= low_stock_threshold;

-- ------------------------------------------------------------ customers + loyalty
CREATE TABLE IF NOT EXISTS customers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name           TEXT,
  phone          TEXT NOT NULL,
  email          TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  total_spent    NUMERIC(14,2) NOT NULL DEFAULT 0,
  orders_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, phone)
);
CREATE INDEX IF NOT EXISTS customers_store_idx ON customers (store_id);

-- ------------------------------------------------------------ orders
CREATE TABLE IF NOT EXISTS orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_number    TEXT NOT NULL,
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  customer_name   TEXT,
  customer_phone  TEXT,
  customer_address TEXT,
  channel         TEXT NOT NULL DEFAULT 'ONLINE_WHATSAPP'
                    CHECK (channel IN ('ONLINE_WHATSAPP','POS','COD_RIDER')),
  payment_method  TEXT NOT NULL DEFAULT 'MOMO'
                    CHECK (payment_method IN ('CASH','MOMO','COD')),
  status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','PAID','FULFILLED','DELIVERED','CANCELLED')),
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  delivery_fee    NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  points_earned   INTEGER NOT NULL DEFAULT 0,
  points_redeemed INTEGER NOT NULL DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  rider_name      TEXT,
  rider_phone     TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at         TIMESTAMPTZ,
  client_reference TEXT
);
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON orders (store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS orders_number_idx ON orders (order_number);
CREATE UNIQUE INDEX IF NOT EXISTS orders_client_reference_idx
  ON orders (store_id, client_reference) WHERE client_reference IS NOT NULL;
-- Backward-compatible mirrors for older storefront/order readers. Canonical
-- order lifecycle columns are status, subtotal, total and paid_at.
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS order_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS client_reference TEXT;

UPDATE orders
   SET order_status = CASE
         WHEN status = 'DELIVERED' THEN 'DELIVERED'
         WHEN status = 'CANCELLED' THEN 'CANCELLED'
         WHEN status IN ('PAID','FULFILLED') THEN 'PROCESSING'
         ELSE 'PENDING' END,
       payment_status = CASE WHEN status IN ('PAID','FULFILLED','DELIVERED') THEN 'PAID' ELSE 'PENDING' END,
       total_amount = total
 WHERE order_status IS DISTINCT FROM CASE
         WHEN status = 'DELIVERED' THEN 'DELIVERED'
         WHEN status = 'CANCELLED' THEN 'CANCELLED'
         WHEN status IN ('PAID','FULFILLED') THEN 'PROCESSING'
         ELSE 'PENDING' END
    OR payment_status IS DISTINCT FROM CASE WHEN status IN ('PAID','FULFILLED','DELIVERED') THEN 'PAID' ELSE 'PENDING' END
    OR total_amount IS DISTINCT FROM total;

-- ------------------------------------------------------------ order items
CREATE TABLE IF NOT EXISTS order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id     UUID REFERENCES products(id) ON DELETE SET NULL,
  variant_id     UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name   TEXT NOT NULL,
  variant_label  TEXT,
  unit_price     NUMERIC(12,2) NOT NULL,
  total_price    NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  line_total     NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

-- ------------------------------------------------------------ low-stock alert audit
CREATE TABLE IF NOT EXISTS product_restock_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  variant_id      UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  stock_quantity  INTEGER NOT NULL,
  reorder_level   INTEGER NOT NULL,
  triggered_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_restock_alerts_store
  ON product_restock_alerts (store_id, triggered_at DESC);

-- ------------------------------------------------------------ theme architecture
CREATE TABLE IF NOT EXISTS theme_templates (
  id          VARCHAR(100) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  category    VARCHAR(50)  NOT NULL,
  config      JSONB        NOT NULL,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS active_theme_id VARCHAR(100) REFERENCES theme_templates(id),
  ADD COLUMN IF NOT EXISTS custom_theme_config JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ------------------------------------------------------------ payouts (Module 3)
CREATE TABLE IF NOT EXISTS payouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  destination    TEXT NOT NULL,                       -- MoMo number 233...
  network        TEXT NOT NULL CHECK (network IN ('MTN','VODAFONE','AT')),
  provider       TEXT NOT NULL DEFAULT 'HUBTEL'
                   CHECK (provider IN ('MTN','HUBTEL')),
  fallback_used  BOOLEAN NOT NULL DEFAULT FALSE,      -- TRUE when Hubtel retried after MTN
  mtn_status     TEXT,                                -- last MTN leg status before fallback
  status         TEXT NOT NULL DEFAULT 'APPROVED'
                   CHECK (status IN ('APPROVED','PENDING_REVIEW','FAILED','PROCESSING')),
  reference      TEXT UNIQUE,
  failure_reason TEXT,
  initiated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payouts_store_idx ON payouts (store_id, initiated_at DESC);

-- 2-way payments: record which provider moved each payout (existing
-- deployments gain the columns via ADD COLUMN below; fresh installs get
-- them inline above).
ALTER TABLE payouts
  ADD COLUMN IF NOT EXISTS provider      TEXT NOT NULL DEFAULT 'HUBTEL',
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mtn_status    TEXT;

-- Intent-first payouts + idempotency guard. STATUS 'PROCESSING' marks a
-- reserved-but-not-yet-disbursed intent; a UNIQUE reference stops a retried
-- or replayed request from paying twice. Existing deployments inherit both
-- through the guarded statements below (the CREATE INDEX is idempotent and
-- the CHECK relaxation is applied via a rebuilt constraint only when the old
-- one still exists).
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS reference TEXT;

DO $$
BEGIN
  -- Relax the status CHECK to include PROCESSING on legacy tables.
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payouts_status_check'
  ) THEN
    ALTER TABLE payouts DROP CONSTRAINT payouts_status_check;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payouts_status_allowed_check'
  ) THEN
    ALTER TABLE payouts
      ADD CONSTRAINT payouts_status_allowed_check
      CHECK (status IN ('APPROVED','PENDING_REVIEW','FAILED','PROCESSING'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS payouts_reference_unique_idx
  ON payouts (reference) WHERE reference IS NOT NULL;


-- MODULE 4: cash collected by dispatch riders while in transit.
CREATE TABLE IF NOT EXISTS rider_transits (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_ids      JSONB NOT NULL DEFAULT '[]'::jsonb,
  rider_name     TEXT NOT NULL,
  rider_phone    TEXT,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  status         TEXT NOT NULL DEFAULT 'TRANSIT' CHECK (status IN ('TRANSIT','RECONCILED')),
  dispatched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS rider_transits_store_idx
  ON rider_transits (store_id, status, dispatched_at DESC);

-- ------------------------------------------------------------ platform admins
CREATE TABLE IF NOT EXISTS platform_admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  name           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------ subscription payments (Module 1)
-- Every POST /api/billing/subscribe attempt is recorded here BEFORE the
-- provider is charged: a crash after collection leaves a PENDING row (never a
-- silent ACTIVE), and a UNIQUE reference stops a retried request paying twice.
CREATE TABLE IF NOT EXISTS subscription_payments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  plan_id           TEXT NOT NULL,
  amount            NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  momo_number       TEXT NOT NULL,
  network           TEXT NOT NULL CHECK (network IN ('MTN','VODAFONE','AT')),
  provider          TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (provider IN ('MTN','HUBTEL','PENDING')),
  reference         TEXT,
  gateway_reference TEXT,
  status            TEXT NOT NULL DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','PAID','FAILED')),
  failure_reason    TEXT,
  initiated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  paid_at           TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_payments_ref_idx
  ON subscription_payments (reference) WHERE reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS subscription_payments_store_idx
  ON subscription_payments (store_id, initiated_at DESC);

-- ------------------------------------------------------------ store domains (Module 7)
CREATE TABLE IF NOT EXISTS store_domains (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id            UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  domain_name         TEXT NOT NULL,
  provider            TEXT NOT NULL DEFAULT 'EXTERNAL'
                        CHECK (provider IN ('EXTERNAL','PURCHASED')),
  status              TEXT NOT NULL DEFAULT 'PENDING_DNS'
                        CHECK (status IN ('PENDING_DNS','ACTIVE','FAILED','CANCELLED')),
  custom_hostname_id  TEXT,
  ssl_status          TEXT DEFAULT 'pending',
  dns_target_a        TEXT,
  dns_target_cname    TEXT,
  price_paid_ghs      NUMERIC(10,2),
  purchase_reference  TEXT,
  verification_errors JSONB DEFAULT '[]'::jsonb,
  registered_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS store_domains_name_idx ON store_domains (LOWER(domain_name));
CREATE INDEX IF NOT EXISTS store_domains_store_idx ON store_domains (store_id, status);
CREATE INDEX IF NOT EXISTS store_domains_status_idx ON store_domains (status, created_at DESC);



-- Canonical DiDwa fresh-install schema; supplemental historical SQL is not executed.
