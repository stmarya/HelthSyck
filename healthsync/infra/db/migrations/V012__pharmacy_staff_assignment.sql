-- V012: Explicitly map pharmacist identities to pharmacies.
-- JWT `sub` is a users.id, while prescriptions.pharmacy_id is a pharmacies.id.
-- This mapping removes unsafe comparisons between unrelated identifiers.

BEGIN;

CREATE TABLE IF NOT EXISTS pharmacy_staff (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pharmacy_id UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, pharmacy_id)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_staff_pharmacy_active
  ON pharmacy_staff (pharmacy_id, is_active);

-- Development/demo assignments. Production assignments are managed explicitly.
INSERT INTO pharmacy_staff (user_id, pharmacy_id, is_active)
VALUES
  ('00300000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', TRUE),
  ('00300000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000002', TRUE)
ON CONFLICT (user_id, pharmacy_id) DO UPDATE SET is_active = EXCLUDED.is_active;

COMMIT;
