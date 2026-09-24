-- ============================================================
-- DIDWA - Order Management Module (public checkout flow)
--
-- Idempotent: safe to re-run on every deploy. Complements
-- db/schema.sql, which creates the shared orders / order_items
-- ledger used by POS + WhatsApp channels. This migration layers
-- the self-serve checkout lifecycle onto the same tables so all
-- channels report into one ledger.
--
-- Apply: npm run db:init   (runs after schema.sql automatically)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------------
-- Greenfield guard: matches the module contract on empty databases.
-- No-ops on existing deployments (tables already exist).
-- ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  order_number     TEXT UNIQUE,
  customer_name    VARCHAR(150) NOT NULL,
  customer_phone   VARCHAR(20)  NOT NULL,
  customer_address TEXT,
  total_amount     DECIMAL(10,2) NOT NULL DEFAULT 0,
  payment_method   VARCHAR(50)  NOT NULL DEFAULT 'COD',
  payment_status   VARCHAR(20)  NOT NULL DEFAULT 'PENDING',
  order_status     VARCHAR(20)  NOT NULL DEFAULT 'PENDING', -- PENDING|PROCESSING|DELIVERED|CANCELLED
  notes            TEXT,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS order_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  store_id     UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id   UUID REFERENCES products(id),
  variant_id   UUID REFERENCES product_variants(id),
  product_name VARCHAR(255) NOT NULL,
  quantity     INT NOT NULL CHECK (quantity > 0),
  unit_price   DECIMAL(10,2) NOT NULL DEFAULT 0,
  total_price  DECIMAL(10,2) NOT NULL DEFAULT 0,
  line_total   DECIMAL(10,2) NOT NULL DEFAULT 0
);

-- ------------------------------------------------------------------
-- Layer checkout columns onto existing deployments that already
-- own these tables from db/schema.sql.
-- ------------------------------------------------------------------
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS customer_address TEXT,
  ADD COLUMN IF NOT EXISTS total_amount     DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS payment_status   VARCHAR(20) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS order_status     VARCHAR(20) DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS updated_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW();

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS store_id    UUID REFERENCES stores(id),
  ADD COLUMN IF NOT EXISTS product_id  UUID REFERENCES products(id),
  ADD COLUMN IF NOT EXISTS total_price DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS line_total  DECIMAL(10,2);

-- Backfill tenant scope on legacy item rows via their parent order.
UPDATE order_items i
   SET store_id = o.store_id
  FROM orders o
 WHERE i.order_id = o.id AND i.store_id IS NULL;
ALTER TABLE order_items
  ALTER COLUMN store_id SET DEFAULT NULL;

-- Legacy rows: never leave the new lifecycle columns NULL.
UPDATE orders SET order_status = 'CANCELLED'
 WHERE order_status IS NULL AND status = 'CANCELLED';
UPDATE orders SET order_status = 'DELIVERED'
 WHERE order_status IS NULL AND status = 'DELIVERED';
UPDATE orders SET order_status = 'PROCESSING'
 WHERE order_status IS NULL AND status IN ('PAID', 'FULFILLED');
UPDATE orders SET order_status = 'PENDING'
 WHERE order_status IS NULL;

UPDATE orders
   SET payment_status = CASE WHEN status IN ('PAID','FULFILLED','DELIVERED')
                             THEN 'PAID' ELSE 'PENDING' END
 WHERE payment_status IS NULL;

UPDATE orders SET total_amount = total WHERE total_amount IS NULL;
UPDATE order_items SET total_price = line_total WHERE total_price IS NULL;

-- Fulfillment-console query patterns.
CREATE INDEX IF NOT EXISTS orders_store_status_idx
  ON orders (store_id, order_status, created_at DESC);
CREATE INDEX IF NOT EXISTS order_items_order_idx
  ON order_items (order_id);