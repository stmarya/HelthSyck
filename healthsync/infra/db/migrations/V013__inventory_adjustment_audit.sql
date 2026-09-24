-- V013: Immutable audit trail for manual pharmacy stock adjustments.
BEGIN;
CREATE TABLE IF NOT EXISTS pharmacy_inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE RESTRICT,
  drug_id UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
  actor_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL CHECK (length(btrim(reason)) > 0),
  resulting_stock INTEGER NOT NULL CHECK (resulting_stock >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_pharmacy_created
  ON pharmacy_inventory_adjustments (pharmacy_id, created_at DESC);
COMMIT;
