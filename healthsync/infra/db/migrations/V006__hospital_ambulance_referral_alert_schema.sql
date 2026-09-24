-- V006: Hospitals, beds, ambulances, and referrals

-- ─────────────────────────────────────────────────────────────
-- ENUM types
-- ─────────────────────────────────────────────────────────────
CREATE TYPE hospital_type AS ENUM ('TYPE_A', 'TYPE_B', 'TYPE_C', 'TYPE_D', 'CLINIC', 'PUSKESMAS');

CREATE TYPE bed_status AS ENUM ('AVAILABLE', 'OCCUPIED', 'RESERVED', 'MAINTENANCE');

CREATE TYPE ambulance_status AS ENUM (
  'OFFLINE', 'AVAILABLE', 'DISPATCHED', 'EN_ROUTE', 'AT_SCENE', 'TRANSPORTING', 'RETURNING'
);

CREATE TYPE referral_status AS ENUM (
  'DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'IN_TRANSIT', 'ARRIVED', 'CANCELLED'
);

CREATE TYPE alert_level AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3');
CREATE TYPE alert_status AS ENUM ('ACTIVE', 'ACKNOWLEDGED', 'RESOLVED', 'FALSE_POSITIVE');

-- ─────────────────────────────────────────────────────────────
-- hospitals — partner hospitals
-- ─────────────────────────────────────────────────────────────
CREATE TABLE hospitals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              VARCHAR(255) NOT NULL,
  type              hospital_type NOT NULL DEFAULT 'TYPE_C',
  license_number    VARCHAR(100) NOT NULL,
  address           TEXT NOT NULL,
  city              VARCHAR(100) NOT NULL,
  province          VARCHAR(100) NOT NULL,
  latitude          NUMERIC(10,7),
  longitude         NUMERIC(10,7),
  phone             VARCHAR(20),
  email             VARCHAR(255),
  igd_phone         VARCHAR(20),
  total_beds        INTEGER NOT NULL DEFAULT 0,
  available_beds    INTEGER NOT NULL DEFAULT 0,
  icu_total         INTEGER NOT NULL DEFAULT 0,
  icu_available     INTEGER NOT NULL DEFAULT 0,
  specializations   TEXT[],        -- array: ['CARDIOLOGY','NEUROLOGY',...]
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  is_emt_partner    BOOLEAN NOT NULL DEFAULT FALSE,  -- ambulance partnership
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_hospitals_license ON hospitals (license_number);
CREATE INDEX idx_hospitals_city     ON hospitals (city, is_active);
CREATE INDEX idx_hospitals_location ON hospitals USING GIST (
  ll_to_earth(latitude::float8, longitude::float8)
);
CREATE TRIGGER set_hospitals_updated_at
  BEFORE UPDATE ON hospitals FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- FK from doctors to hospitals (deferred since hospitals created after doctors)
ALTER TABLE doctors ADD CONSTRAINT fk_doctor_hospital
  FOREIGN KEY (hospital_id) REFERENCES hospitals(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────
-- hospital_beds — individual bed tracking
-- ─────────────────────────────────────────────────────────────
CREATE TABLE hospital_beds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  ward         VARCHAR(100) NOT NULL,   -- 'ICU' | 'GENERAL' | 'PEDIATRIC' | 'MATERNITY'
  room_number  VARCHAR(20) NOT NULL,
  bed_number   VARCHAR(20) NOT NULL,
  status       bed_status NOT NULL DEFAULT 'AVAILABLE',
  patient_id   UUID REFERENCES patients(id) ON DELETE SET NULL,
  admitted_at  TIMESTAMPTZ,
  UNIQUE (hospital_id, room_number, bed_number)
);
CREATE INDEX idx_beds_hospital_status ON hospital_beds (hospital_id, status, ward);

-- ─────────────────────────────────────────────────────────────
-- ambulances
-- ─────────────────────────────────────────────────────────────
CREATE TABLE ambulances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE CASCADE,
  plate_number VARCHAR(20) NOT NULL,
  type         VARCHAR(50) NOT NULL DEFAULT 'BLS',   -- 'BLS' | 'ALS' | 'NICU'
  status       ambulance_status NOT NULL DEFAULT 'OFFLINE',
  driver_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  latitude     NUMERIC(10,7),
  longitude    NUMERIC(10,7),
  heading      NUMERIC(5,2),      -- degrees 0–360
  speed_kmh    NUMERIC(5,1),
  last_location_at TIMESTAMPTZ,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_ambulances_plate ON ambulances (plate_number);
CREATE INDEX idx_ambulances_hospital_status ON ambulances (hospital_id, status);
CREATE TRIGGER set_ambulances_updated_at
  BEFORE UPDATE ON ambulances FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ambulance_location_history — time-series tracking
CREATE TABLE ambulance_locations (
  ambulance_id UUID NOT NULL REFERENCES ambulances(id) ON DELETE CASCADE,
  latitude     NUMERIC(10,7) NOT NULL,
  longitude    NUMERIC(10,7) NOT NULL,
  heading      NUMERIC(5,2),
  speed_kmh    NUMERIC(5,1),
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT create_hypertable('ambulance_locations', 'recorded_at',
  chunk_time_interval => INTERVAL '1 day', if_not_exists => TRUE);
CREATE INDEX idx_amb_loc_ambulance ON ambulance_locations (ambulance_id, recorded_at DESC);

-- ─────────────────────────────────────────────────────────────
-- referrals — inter-hospital patient transfers
-- ─────────────────────────────────────────────────────────────
CREATE TABLE referrals (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id        UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  from_hospital_id  UUID NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
  to_hospital_id    UUID NOT NULL REFERENCES hospitals(id) ON DELETE RESTRICT,
  referring_doctor_id UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  receiving_doctor_id UUID REFERENCES doctors(id) ON DELETE SET NULL,
  ambulance_id      UUID REFERENCES ambulances(id) ON DELETE SET NULL,
  status            referral_status NOT NULL DEFAULT 'DRAFT',
  reason            TEXT NOT NULL,
  diagnosis         TEXT,
  urgency_level     VARCHAR(20) NOT NULL DEFAULT 'NORMAL',  -- 'CRITICAL'|'URGENT'|'NORMAL'
  required_specialization VARCHAR(100),
  notes             TEXT,
  rejected_reason   TEXT,
  sent_at           TIMESTAMPTZ,
  accepted_at       TIMESTAMPTZ,
  arrived_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_referrals_patient    ON referrals (patient_id, created_at DESC);
CREATE INDEX idx_referrals_from_hosp  ON referrals (from_hospital_id, status);
CREATE INDEX idx_referrals_to_hosp    ON referrals (to_hospital_id, status);
CREATE TRIGGER set_referrals_updated_at
  BEFORE UPDATE ON referrals FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- alerts — IoT threshold alerts
-- ─────────────────────────────────────────────────────────────
CREATE TABLE alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id      UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  device_id       VARCHAR(100),
  vital_sign_id   UUID,             -- references vital_signs.id (no FK due to hypertable)
  level           alert_level NOT NULL,
  status          alert_status NOT NULL DEFAULT 'ACTIVE',
  trigger_metric  VARCHAR(50) NOT NULL,   -- 'heart_rate' | 'spo2' | 'temperature'
  trigger_value   NUMERIC(8,2) NOT NULL,
  threshold_value NUMERIC(8,2) NOT NULL,
  message         TEXT NOT NULL,
  acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  resolved_at     TIMESTAMPTZ,
  escalated_to_level alert_level,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
SELECT create_hypertable('alerts', 'created_at',
  chunk_time_interval => INTERVAL '1 week', if_not_exists => TRUE);
CREATE INDEX idx_alerts_patient_status ON alerts (patient_id, status, created_at DESC);
CREATE INDEX idx_alerts_active         ON alerts (status, level) WHERE status = 'ACTIVE';
