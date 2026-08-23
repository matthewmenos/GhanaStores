-- ============================================================
-- GHANA STORES - Neon PostgreSQL Schema
-- Row-Level Multi-Tenancy: every tenant table carries store_id.
-- Apply with: npm run db:init   (or psql -f db/schema.sql)
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
  paid_at         TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS orders_store_created_idx ON orders (store_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS orders_number_idx ON orders (order_number);

CREATE TABLE IF NOT EXISTS order_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_id       UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  variant_id     UUID REFERENCES product_variants(id) ON DELETE SET NULL,
  product_name   TEXT NOT NULL,
  variant_label  TEXT,
  unit_price     NUMERIC(12,2) NOT NULL,
  quantity       INTEGER NOT NULL CHECK (quantity > 0),
  line_total     NUMERIC(12,2) NOT NULL
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items (order_id);

-- ------------------------------------------------------------ payouts (Module 3)
CREATE TABLE IF NOT EXISTS payouts (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  amount         NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  destination    TEXT NOT NULL,                       -- MoMo number 233...
  network        TEXT NOT NULL CHECK (network IN ('MTN','VODAFONE','AT')),
  status         TEXT NOT NULL DEFAULT 'APPROVED'
                   CHECK (status IN ('APPROVED','PENDING_REVIEW','FAILED')),
  reference      TEXT,
  failure_reason TEXT,
  initiated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS payouts_store_idx ON payouts (store_id, initiated_at DESC);

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


