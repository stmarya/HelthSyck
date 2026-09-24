-- V007: Notifications, audit trails, and seed data

-- ─────────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────────
CREATE TYPE notification_channel AS ENUM ('PUSH', 'SMS', 'IN_APP', 'EMAIL');
CREATE TYPE notification_status  AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'READ');

CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  channel       notification_channel NOT NULL,
  status        notification_status NOT NULL DEFAULT 'PENDING',
  title         VARCHAR(255),
  body          TEXT NOT NULL,
  data          JSONB,                -- deep-link, entity references
  priority      VARCHAR(20) NOT NULL DEFAULT 'NORMAL',  -- 'CRITICAL' | 'HIGH' | 'NORMAL' | 'LOW'
  reference_id  UUID,                -- e.g. alert_id, referral_id
  reference_type VARCHAR(50),        -- 'ALERT' | 'REFERRAL' | 'CONSULTATION' | 'PRESCRIPTION'
  sent_at       TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  read_at       TIMESTAMPTZ,
  failed_reason TEXT,
  retry_count   SMALLINT NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user    ON notifications (user_id, status, created_at DESC);
CREATE INDEX idx_notifications_pending ON notifications (status, created_at) WHERE status = 'PENDING';
CREATE INDEX idx_notifications_ref     ON notifications (reference_type, reference_id);

-- push_tokens — FCM / APNs device tokens
CREATE TABLE push_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token       TEXT NOT NULL,
  platform    VARCHAR(20) NOT NULL,   -- 'ANDROID' | 'IOS' | 'WEB'
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_push_tokens_token ON push_tokens (token);
CREATE INDEX idx_push_tokens_user ON push_tokens (user_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- medical_audit_logs — immutable record of all data access (UU PDP + Permenkes)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE medical_audit_logs (
  id              BIGSERIAL PRIMARY KEY,
  accessor_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  accessor_role   user_role NOT NULL,
  patient_id      UUID REFERENCES patients(id) ON DELETE SET NULL,
  action          VARCHAR(100) NOT NULL,  -- 'READ_VITALS' | 'CREATE_PRESCRIPTION' | 'VIEW_RECORD' etc.
  resource_type   VARCHAR(100) NOT NULL,
  resource_id     UUID,
  ip_address      INET,
  user_agent      TEXT,
  request_id      UUID,
  justification   TEXT,               -- required for sensitive access
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Partitioned by month for query performance
CREATE INDEX idx_med_audit_accessor ON medical_audit_logs (accessor_id, created_at DESC);
CREATE INDEX idx_med_audit_patient  ON medical_audit_logs (patient_id, created_at DESC) WHERE patient_id IS NOT NULL;
CREATE INDEX idx_med_audit_action   ON medical_audit_logs (action, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- consent_records — UU PDP granular consent tracking
-- ─────────────────────────────────────────────────────────────
CREATE TABLE consent_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  consent_type  VARCHAR(100) NOT NULL,  -- 'VITALS_COLLECTION' | 'DATA_ANALYTICS' | 'THIRD_PARTY_SHARE'
  is_granted    BOOLEAN NOT NULL DEFAULT FALSE,
  granted_at    TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ,
  version       VARCHAR(20) NOT NULL DEFAULT '1.0',
  ip_address    INET,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_consent_user_type ON consent_records (user_id, consent_type);
CREATE INDEX idx_consent_user ON consent_records (user_id);

-- ─────────────────────────────────────────────────────────────
-- SEED DATA: Development only
-- ─────────────────────────────────────────────────────────────
-- Test hospital
INSERT INTO hospitals (id, name, type, license_number, address, city, province, latitude, longitude,
  phone, igd_phone, total_beds, available_beds, icu_total, icu_available,
  specializations, is_active, is_emt_partner)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'RSUD Pilot Jakarta Selatan', 'TYPE_B',
  'RS-JKT-2024-001',
  'Jl. Sudirman No. 1, Jakarta Selatan', 'Jakarta Selatan', 'DKI Jakarta',
  -6.2088, 106.8456, '021-5550001', '021-5550911',
  200, 45, 20, 8,
  ARRAY['CARDIOLOGY','NEUROLOGY','ORTHOPEDIC','GENERAL_SURGERY','INTERNAL_MEDICINE'],
  TRUE, TRUE
);

-- Test drugs
INSERT INTO drugs (id, generic_name, brand_name, dosage_form, strength, unit, drug_class, requires_prescription)
VALUES
  ('d0000000-0000-0000-0000-000000000001', 'Amoxicillin', 'Amoxan', 'CAPSULE', '500mg', 'capsule', 'ANTIBIOTIC', TRUE),
  ('d0000000-0000-0000-0000-000000000002', 'Paracetamol', 'Panadol', 'TABLET', '500mg', 'tablet', 'ANALGESIC', FALSE),
  ('d0000000-0000-0000-0000-000000000003', 'Omeprazole', 'Losec', 'CAPSULE', '20mg', 'capsule', 'ANTACID', TRUE),
  ('d0000000-0000-0000-0000-000000000004', 'Amlodipine', 'Norvasc', 'TABLET', '5mg', 'tablet', 'ANTIHYPERTENSIVE', TRUE),
  ('d0000000-0000-0000-0000-000000000005', 'Metformin', 'Glucophage', 'TABLET', '500mg', 'tablet', 'ANTIDIABETIC', TRUE);
