-- ============================================================
-- DIDWA - Multi-Variant Inventory & Low-Stock Alerts
-- Module 6 supplemental DDL.
--
-- Idempotent: safe to re-run on any environment (fresh or existing).
-- The `product_variants` definition deliberately matches the columns the
-- application already persists (option_name/option_value ≈ attribute_name/
-- attribute_value, low_stock_threshold ≈ reorder_level) so this file can
-- bootstrap a brand-new database AND run alongside db/schema.sql on live
-- Neon instances without destructive DDL.
-- ============================================================

-- ------------------------------------------------------------
-- Variants: SKU-level inventory with per-variant re-order levels.
--   attribute_name / attribute_value  map to option_name / option_value
--   reorder_level                     maps to low_stock_threshold
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS product_variants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id              UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id            UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  option_name           TEXT NOT NULL DEFAULT 'Default',   -- Size / Colour
  option_value          TEXT NOT NULL,                     -- XL / Red
  sku                   TEXT,
  price_override        NUMERIC(12,2),
  stock_quantity        INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold   INTEGER NOT NULL DEFAULT 5,
  low_stock_alert_sent  BOOLEAN NOT NULL DEFAULT FALSE,    -- duplicate-SMS latch
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, option_name, option_value)
);

CREATE INDEX IF NOT EXISTS variants_store_idx ON product_variants (store_id);
CREATE INDEX IF NOT EXISTS variants_low_stock_scan_idx
  ON product_variants (store_id)
  WHERE stock_quantity <= low_stock_threshold;

-- ------------------------------------------------------------
-- Alerts: immutable audit trail of every low-stock SMS fired per variant.
-- Written by routes/inventoryRoutes.js on successful alert dispatch so the
-- merchant sees exactly when + at what stock level a reorder SMS was sent.
-- ------------------------------------------------------------
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

-- ============================================================
-- Optional: one-off column-addition safety net for databases whose
-- schema predates the `sku` column. No-op when it already exists.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'product_variants' AND column_name = 'sku'
  ) THEN
    ALTER TABLE product_variants ADD COLUMN sku TEXT;
  END IF;
END $$;