-- V014: Immutable operational audit trail for pharmacy assignments and stock.

CREATE TABLE IF NOT EXISTS pharmacy_audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id  UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  actor_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action       VARCHAR(80) NOT NULL,
  entity_type  VARCHAR(80) NOT NULL,
  entity_id    UUID,
  metadata     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pharmacy_audit_logs_pharmacy_created
  ON pharmacy_audit_logs (pharmacy_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pharmacy_audit_logs_actor_created
  ON pharmacy_audit_logs (actor_id, created_at DESC);