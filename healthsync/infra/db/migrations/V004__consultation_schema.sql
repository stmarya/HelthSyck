-- V004: Doctor profiles and consultation system

-- ─────────────────────────────────────────────────────────────
-- ENUM types
-- ─────────────────────────────────────────────────────────────
CREATE TYPE consultation_status AS ENUM (
  'PENDING',       -- Pasien request, belum ada dokter
  'ACCEPTED',      -- Dokter terima
  'IN_PROGRESS',   -- Aktif chat/konsultasi
  'COMPLETED',     -- Dokter tutup
  'CANCELLED',     -- Dibatalkan pasien/dokter
  'EXPIRED'        -- Timeout tidak direspons
);

CREATE TYPE message_type AS ENUM ('TEXT', 'IMAGE', 'FILE', 'SYSTEM');

-- ─────────────────────────────────────────────────────────────
-- doctors — one-to-one with users (role=DOCTOR)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE doctors (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  str_number        VARCHAR(50) NOT NULL,    -- Surat Tanda Registrasi
  sip_number        VARCHAR(50) NOT NULL,    -- Surat Izin Praktik
  specialization    VARCHAR(100) NOT NULL,
  sub_specialization VARCHAR(100),
  hospital_id       UUID,                    -- FK added in V006 after hospitals table
  years_experience  SMALLINT,
  education         TEXT,
  bio               TEXT,
  consultation_fee  NUMERIC(12,2) NOT NULL DEFAULT 0,
  is_available      BOOLEAN NOT NULL DEFAULT FALSE,
  rating_avg        NUMERIC(3,2),
  rating_count      INTEGER NOT NULL DEFAULT 0,
  str_verified_at   TIMESTAMPTZ,
  sip_verified_at   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_doctors_str ON doctors (str_number);
CREATE UNIQUE INDEX idx_doctors_sip ON doctors (sip_number);
CREATE INDEX idx_doctors_available ON doctors (is_available, specialization);
CREATE INDEX idx_doctors_user ON doctors (user_id);

CREATE TRIGGER set_doctors_updated_at
  BEFORE UPDATE ON doctors
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- consultations — session between patient and doctor
-- ─────────────────────────────────────────────────────────────
CREATE TABLE consultations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id       UUID REFERENCES doctors(id) ON DELETE SET NULL,
  status          consultation_status NOT NULL DEFAULT 'PENDING',
  chief_complaint TEXT NOT NULL,
  diagnosis       TEXT,
  notes           TEXT,
  symptom_data    JSONB,             -- output from symptom checker
  started_at      TIMESTAMPTZ,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_consultations_patient   ON consultations (patient_id, created_at DESC);
CREATE INDEX idx_consultations_doctor    ON consultations (doctor_id, status);
CREATE INDEX idx_consultations_status    ON consultations (status, created_at);

CREATE TRIGGER set_consultations_updated_at
  BEFORE UPDATE ON consultations
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- consultation_messages — chat messages in a consultation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE consultation_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id  UUID NOT NULL REFERENCES consultations(id) ON DELETE CASCADE,
  sender_id        UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  message_type     message_type NOT NULL DEFAULT 'TEXT',
  content          TEXT,
  file_url         TEXT,
  file_name        TEXT,
  is_read          BOOLEAN NOT NULL DEFAULT FALSE,
  read_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_consultation ON consultation_messages (consultation_id, created_at ASC);
CREATE INDEX idx_messages_unread       ON consultation_messages (consultation_id, is_read) WHERE NOT is_read;

-- ─────────────────────────────────────────────────────────────
-- consultation_ratings — patient rates doctor post-consultation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE consultation_ratings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id  UUID NOT NULL UNIQUE REFERENCES consultations(id) ON DELETE CASCADE,
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  doctor_id        UUID NOT NULL REFERENCES doctors(id) ON DELETE CASCADE,
  rating           SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review           TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ratings_doctor ON consultation_ratings (doctor_id, created_at DESC);
