-- =====================================================================
-- Ghana Stores — Core Schema (Neon PostgreSQL)
-- Multi-tenancy model: every tenant-owned row carries a store_id column.
-- Application code MUST scope every query by store_id (see middleware/authMiddleware.js).
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- STORES (tenants)
-- ---------------------------------------------------------------------
CREATE TYPE store_status AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED');

CREATE TABLE stores (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_name          VARCHAR(120) NOT NULL,
    store_name          VARCHAR(120) NOT NULL,
    subdomain_slug      VARCHAR(63) UNIQUE NOT NULL,
    custom_domain       VARCHAR(255) UNIQUE,
    custom_domain_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone               VARCHAR(20) NOT NULL UNIQUE,
    email               VARCHAR(160) UNIQUE,
    password_hash       TEXT NOT NULL,
    momo_network        VARCHAR(20) CHECK (momo_network IN ('MTN', 'TELECEL', 'AT')),
    momo_number         VARCHAR(20),
    status              store_status NOT NULL DEFAULT 'TRIALING',
    trial_ends_at       TIMESTAMPTZ NOT NULL,
    grace_ends_at       TIMESTAMPTZ,
    currency            VARCHAR(3) NOT NULL DEFAULT 'GHS',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stores_subdomain ON stores(subdomain_slug);
CREATE INDEX idx_stores_custom_domain ON stores(custom_domain) WHERE custom_domain IS NOT NULL;
CREATE INDEX idx_stores_status ON stores(status);

-- Auto-set trial_ends_at = NOW() + 14 days on insert, unless explicitly provided
CREATE OR REPLACE FUNCTION set_trial_end() RETURNS TRIGGER AS $$
BEGIN
    IF NEW.trial_ends_at IS NULL THEN
        NEW.trial_ends_at := now() + INTERVAL '14 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_trial_end
BEFORE INSERT ON stores
FOR EACH ROW EXECUTE FUNCTION set_trial_end();

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_stores_updated_at
BEFORE UPDATE ON stores
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------------
-- STORE WALLET (available vs pending balances, row-locked on payout)
-- ---------------------------------------------------------------------
CREATE TABLE store_wallets (
    store_id            UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
    available_balance    NUMERIC(14,2) NOT NULL DEFAULT 0,
    pending_balance       NUMERIC(14,2) NOT NULL DEFAULT 0,
    rider_transit_balance NUMERIC(14,2) NOT NULL DEFAULT 0,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- ADMIN USERS (staff accounts per store, e.g. cashiers on POS)
-- ---------------------------------------------------------------------
CREATE TABLE store_staff (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    full_name     VARCHAR(120) NOT NULL,
    role          VARCHAR(20) NOT NULL DEFAULT 'CASHIER' CHECK (role IN ('OWNER','MANAGER','CASHIER','RIDER')),
    phone         VARCHAR(20) NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(store_id, phone)
);

-- ---------------------------------------------------------------------
-- PRODUCTS & VARIANTS
-- ---------------------------------------------------------------------
CREATE TABLE products (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name         VARCHAR(160) NOT NULL,
    description  TEXT,
    category     VARCHAR(80),
    image_url    TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_products_store ON products(store_id);

CREATE TABLE product_variants (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    sku               VARCHAR(80) NOT NULL,
    option_label      VARCHAR(120) NOT NULL, -- e.g. "Size: L / Color: Red"
    price             NUMERIC(12,2) NOT NULL,
    quantity_on_hand  INTEGER NOT NULL DEFAULT 0,
    reorder_threshold INTEGER NOT NULL DEFAULT 5,
    low_stock_alerted_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(store_id, sku)
);
CREATE INDEX idx_variants_store ON product_variants(store_id);
CREATE INDEX idx_variants_low_stock ON product_variants(store_id, quantity_on_hand);

-- ---------------------------------------------------------------------
-- CUSTOMERS & LOYALTY
-- ---------------------------------------------------------------------
CREATE TABLE customers (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id      UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    full_name     VARCHAR(120),
    phone         VARCHAR(20) NOT NULL,
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(store_id, phone)
);

CREATE TABLE loyalty_settings (
    store_id            UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
    points_per_ghs       NUMERIC(6,2) NOT NULL DEFAULT 1,   -- points earned per GHS 1 spent
    ghs_value_per_point  NUMERIC(6,4) NOT NULL DEFAULT 0.05 -- redemption value of 1 point in GHS
);

-- ---------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------
CREATE TYPE order_channel AS ENUM ('ONLINE', 'POS', 'WHATSAPP');
CREATE TYPE order_status AS ENUM ('PENDING', 'PAID', 'FULFILLED', 'CANCELLED', 'REFUNDED');
CREATE TYPE payment_method AS ENUM ('MOMO', 'CASH', 'CARD');

CREATE TABLE orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    customer_id       UUID REFERENCES customers(id),
    channel           order_channel NOT NULL DEFAULT 'ONLINE',
    status            order_status NOT NULL DEFAULT 'PENDING',
    payment_method    payment_method,
    subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
    loyalty_discount  NUMERIC(12,2) NOT NULL DEFAULT 0,
    total             NUMERIC(12,2) NOT NULL DEFAULT 0,
    rider_staff_id    UUID REFERENCES store_staff(id),
    rider_collected_cash BOOLEAN NOT NULL DEFAULT FALSE,
    rider_reconciled_at  TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_store_created ON orders(store_id, created_at DESC);
CREATE INDEX idx_orders_store_status ON orders(store_id, status);

CREATE TABLE order_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    variant_id   UUID NOT NULL REFERENCES product_variants(id),
    quantity     INTEGER NOT NULL,
    unit_price   NUMERIC(12,2) NOT NULL
);

-- ---------------------------------------------------------------------
-- PAYOUTS (Hubtel MoMo Disbursement)
-- ---------------------------------------------------------------------
CREATE TYPE payout_status AS ENUM ('REQUESTED', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'REJECTED');

CREATE TABLE payouts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id       UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    amount         NUMERIC(12,2) NOT NULL,
    momo_network   VARCHAR(20) NOT NULL,
    momo_number    VARCHAR(20) NOT NULL,
    status         payout_status NOT NULL DEFAULT 'REQUESTED',
    hubtel_transaction_id VARCHAR(120),
    failure_reason TEXT,
    requested_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at   TIMESTAMPTZ
);
CREATE INDEX idx_payouts_store ON payouts(store_id, requested_at DESC);

-- ---------------------------------------------------------------------
-- BILLING / SUBSCRIPTION EVENTS (audit trail for the cron)
-- ---------------------------------------------------------------------
CREATE TABLE billing_events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    event_type  VARCHAR(40) NOT NULL, -- TRIAL_REMINDER, PAST_DUE, SUSPENDED, REACTIVATED
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- SMS LOG (Arkesel delivery audit trail)
-- ---------------------------------------------------------------------
CREATE TABLE sms_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id    UUID REFERENCES stores(id) ON DELETE CASCADE,
    to_phone    VARCHAR(20) NOT NULL,
    message     TEXT NOT NULL,
    purpose     VARCHAR(40) NOT NULL, -- WELCOME, TRIAL_REMINDER, LOW_STOCK, PAYOUT_CONFIRMATION...
    status      VARCHAR(20) NOT NULL DEFAULT 'SENT',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- SEED: default loyalty settings on store creation
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION seed_store_defaults() RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO store_wallets (store_id) VALUES (NEW.id);
    INSERT INTO loyalty_settings (store_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_seed_store_defaults
AFTER INSERT ON stores
FOR EACH ROW EXECUTE FUNCTION seed_store_defaults();
