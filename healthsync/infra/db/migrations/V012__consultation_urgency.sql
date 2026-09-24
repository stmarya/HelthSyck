-- V012: Store consultation urgency used by the consultation API and Doctor App.

ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS urgency VARCHAR(20) NOT NULL DEFAULT 'NORMAL';

ALTER TABLE consultations
  DROP CONSTRAINT IF EXISTS consultations_urgency_check;

ALTER TABLE consultations
  ADD CONSTRAINT consultations_urgency_check
  CHECK (urgency IN ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'));

CREATE INDEX IF NOT EXISTS idx_consultations_urgency
  ON consultations (urgency, status, created_at DESC);