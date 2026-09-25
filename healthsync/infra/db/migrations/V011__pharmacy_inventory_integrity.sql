-- V011: Harden pharmacy inventory upserts and common Admin lookups.
--
-- V005 allowed batch_number to be NULL while using
-- UNIQUE (pharmacy_id, drug_id, batch_number). PostgreSQL treats NULL values as
-- distinct, so repeated upserts without a batch could create duplicate rows.
-- This additive migration consolidates existing no-batch duplicates, normalizes
-- future writes to a stable sentinel, and keeps the existing UPSERT contract valid.

BEGIN;

-- Consolidate duplicate no-batch inventory rows without losing stock.
WITH grouped AS (
  SELECT
    pharmacy_id,
    drug_id,
    (array_agg(id ORDER BY updated_at DESC, id DESC))[1] AS keeper_id,
    SUM(stock_qty)::INTEGER AS total_stock,
    MAX(expires_at) AS latest_expiry,
    MIN(reorder_level) AS reorder_level
  FROM pharmacy_inventory
  WHERE batch_number IS NULL OR BTRIM(batch_number) = ''
  GROUP BY pharmacy_id, drug_id
)
UPDATE pharmacy_inventory inventory
SET stock_qty = grouped.total_stock,
    expires_at = grouped.latest_expiry,
    reorder_level = grouped.reorder_level,
    updated_at = NOW()
FROM grouped
WHERE inventory.id = grouped.keeper_id;

WITH grouped AS (
  SELECT
    pharmacy_id,
    drug_id,
    (array_agg(id ORDER BY updated_at DESC, id DESC))[1] AS keeper_id
  FROM pharmacy_inventory
  WHERE batch_number IS NULL OR BTRIM(batch_number) = ''
  GROUP BY pharmacy_id, drug_id
)
DELETE FROM pharmacy_inventory inventory
USING grouped
WHERE inventory.pharmacy_id = grouped.pharmacy_id
  AND inventory.drug_id = grouped.drug_id
  AND (inventory.batch_number IS NULL OR BTRIM(inventory.batch_number) = '')
  AND inventory.id <> grouped.keeper_id;

UPDATE pharmacy_inventory
SET batch_number = '__NO_BATCH__', updated_at = NOW()
WHERE batch_number IS NULL OR BTRIM(batch_number) = '';

-- Normalize explicit NULL/blank values sent by existing service versions before
-- the UNIQUE constraint is evaluated.
CREATE OR REPLACE FUNCTION normalize_pharmacy_inventory_batch()
RETURNS TRIGGER AS $$
BEGIN
  NEW.batch_number := COALESCE(NULLIF(BTRIM(NEW.batch_number), ''), '__NO_BATCH__');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS normalize_pharmacy_inventory_batch_trigger ON pharmacy_inventory;
CREATE TRIGGER normalize_pharmacy_inventory_batch_trigger
  BEFORE INSERT OR UPDATE OF batch_number
  ON pharmacy_inventory
  FOR EACH ROW
  EXECUTE FUNCTION normalize_pharmacy_inventory_batch();

ALTER TABLE pharmacy_inventory
  ALTER COLUMN batch_number SET DEFAULT '__NO_BATCH__',
  ALTER COLUMN batch_number SET NOT NULL;

-- Support the Admin list/search and prescription status filters without full scans.
CREATE INDEX IF NOT EXISTS idx_pharmacies_name_trgm
  ON pharmacies USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_drugs_brand_name_trgm
  ON drugs USING GIN (brand_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_prescriptions_status_issued
  ON prescriptions (status, issued_at DESC);

COMMIT;
