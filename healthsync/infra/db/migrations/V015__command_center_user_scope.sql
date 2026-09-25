-- V015: Explicit hospital scope for Command Center users.
--
-- Referral-service reads this mapping to scope Command Center access. Keep the
-- mapping explicit so an unmapped user receives no referral rows.
CREATE TABLE IF NOT EXISTS command_center_users (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  hospital_id UUID REFERENCES hospitals(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT command_center_users_user_hospital_uq UNIQUE (user_id, hospital_id)
);

CREATE INDEX IF NOT EXISTS idx_command_center_users_user
  ON command_center_users (user_id);

CREATE INDEX IF NOT EXISTS idx_command_center_users_hospital
  ON command_center_users (hospital_id);