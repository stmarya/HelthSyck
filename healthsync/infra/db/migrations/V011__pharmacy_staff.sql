-- V011: Explicit mapping between pharmacist accounts and pharmacies.
-- This removes the previous implicit/incorrect assumption that
-- pharmacies.id == users.id for PHARMACIST users.

CREATE TABLE IF NOT EXISTS pharmacy_staff (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  staff_role   VARCHAR(50) NOT NULL DEFAULT 'PHARMACIST',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pharmacy_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_staff_user
  ON pharmacy_staff (user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_pharmacy_staff_pharmacy
  ON pharmacy_staff (pharmacy_id, is_active);

-- Demo assignments. Production environments should manage these through
-- an admin workflow instead of relying on seed data.
INSERT INTO pharmacy_staff (pharmacy_id, user_id)
VALUES
  ('f0000000-0000-0000-0000-000000000001', '00300000-0000-0000-0000-000000000001'),
  ('f0000000-0000-0000-0000-000000000002', '00300000-0000-0000-0000-000000000002')
ON CONFLICT (pharmacy_id, user_id) DO NOTHING;