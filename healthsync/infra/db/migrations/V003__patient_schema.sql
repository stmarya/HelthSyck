-- V003: Patient profiles, medical history, and vital signs
-- vitals table is a TimescaleDB hypertable (time-series)

-- ─────────────────────────────────────────────────────────────
-- ENUM types
-- ─────────────────────────────────────────────────────────────
CREATE TYPE blood_type AS ENUM ('A+','A-','B+','B-','AB+','AB-','O+','O-','UNKNOWN');
CREATE TYPE gender     AS ENUM ('MALE','FEMALE','OTHER');
CREATE TYPE vital_source AS ENUM ('MANUAL', 'IOT_DEVICE', 'WEARABLE');

-- ─────────────────────────────────────────────────────────────
-- patients — one-to-one with users (role=PATIENT)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE patients (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  nik              VARCHAR(16) NOT NULL,          -- Tokenized NIK (field-level encryption)
  nik_token        VARCHAR(64) NOT NULL,          -- SHA-256 of actual NIK for uniqueness check
  name             VARCHAR(255) NOT NULL,
  date_of_birth    DATE NOT NULL,
  gender           gender NOT NULL,
  blood_type       blood_type NOT NULL DEFAULT 'UNKNOWN',
  phone            VARCHAR(20),
  address          TEXT,
  emergency_contact_name  VARCHAR(255),
  emergency_contact_phone VARCHAR(20),
  profile_photo_url        TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_patients_nik_token ON patients (nik_token);
CREATE UNIQUE INDEX idx_patients_user_id   ON patients (user_id);
CREATE INDEX idx_patients_name_trgm ON patients USING GIN (name gin_trgm_ops);

CREATE TRIGGER set_patients_updated_at
  BEFORE UPDATE ON patients
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- patient_medical_history — known conditions, allergies
-- ─────────────────────────────────────────────────────────────
CREATE TABLE patient_conditions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  icd10_code   VARCHAR(10),
  description  TEXT NOT NULL,
  diagnosed_at DATE,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_conditions_patient ON patient_conditions (patient_id, is_active);

CREATE TABLE patient_allergies (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id   UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  allergen     VARCHAR(255) NOT NULL,
  reaction     TEXT,
  severity     VARCHAR(50),   -- 'MILD' | 'MODERATE' | 'SEVERE'
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_allergies_patient ON patient_allergies (patient_id);

-- ─────────────────────────────────────────────────────────────
-- iot_devices — wearables paired to patients
-- ─────────────────────────────────────────────────────────────
CREATE TABLE iot_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  device_id       VARCHAR(100) NOT NULL,   -- Hardware ID from manufacturer
  device_type     VARCHAR(100) NOT NULL,   -- 'SAMSUNG_GALAXY_WATCH_4' etc.
  firmware_version VARCHAR(20),
  certificate_pem TEXT,                    -- mTLS device certificate
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  last_seen_at    TIMESTAMPTZ,
  paired_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_iot_devices_device_id ON iot_devices (device_id);
CREATE INDEX idx_iot_devices_patient ON iot_devices (patient_id, is_active);

-- ─────────────────────────────────────────────────────────────
-- vital_signs — TimescaleDB hypertable (time-series)
-- Partitioned by recorded_at (weekly chunks)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE vital_signs (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  device_id       VARCHAR(100),
  heart_rate      SMALLINT,          -- bpm (20–300)
  spo2            NUMERIC(5,2),      -- % (50–100)
  systolic_bp     SMALLINT,          -- mmHg
  diastolic_bp    SMALLINT,          -- mmHg
  temperature     NUMERIC(4,1),      -- °C
  activity_level  VARCHAR(20),       -- 'resting' | 'walking' | 'running'
  battery_level   SMALLINT,          -- %
  signal_strength SMALLINT,          -- dBm
  source          vital_source NOT NULL DEFAULT 'WEARABLE',
  raw_payload     JSONB,             -- original MQTT payload for audit
  recorded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Convert to TimescaleDB hypertable, partition weekly
SELECT create_hypertable('vital_signs', 'recorded_at',
  chunk_time_interval => INTERVAL '1 week',
  if_not_exists => TRUE);

-- Compression: compress chunks older than 3 months
ALTER TABLE vital_signs SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'patient_id',
  timescaledb.compress_orderby = 'recorded_at DESC'
);

SELECT add_compression_policy('vital_signs', INTERVAL '3 months', if_not_exists => TRUE);

-- Retention: drop chunks older than 2 years
SELECT add_retention_policy('vital_signs', INTERVAL '2 years', if_not_exists => TRUE);

-- Continuous aggregate: 5-minute averages for dashboard
CREATE MATERIALIZED VIEW vitals_5min_avg
  WITH (timescaledb.continuous) AS
  SELECT
    time_bucket('5 minutes', recorded_at) AS bucket,
    patient_id,
    AVG(heart_rate)   AS avg_heart_rate,
    AVG(spo2)         AS avg_spo2,
    AVG(systolic_bp)  AS avg_systolic,
    AVG(diastolic_bp) AS avg_diastolic,
    AVG(temperature)  AS avg_temperature,
    COUNT(*)          AS sample_count
  FROM vital_signs
  GROUP BY bucket, patient_id
  WITH NO DATA;

SELECT add_continuous_aggregate_policy('vitals_5min_avg',
  start_offset => INTERVAL '1 hour',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 minute',
  if_not_exists => TRUE);

CREATE INDEX idx_vitals_patient_time ON vital_signs (patient_id, recorded_at DESC);
