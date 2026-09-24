-- V005: Prescriptions and pharmacy fulfillment

-- ─────────────────────────────────────────────────────────────
-- ENUM types
-- ─────────────────────────────────────────────────────────────
CREATE TYPE prescription_status AS ENUM (
  'ISSUED',         -- Dokter terbitkan
  'SENT_TO_PHARMACY', -- Dikirim ke apotek
  'CONFIRMED',      -- Apotek konfirmasi stok
  'PREPARING',      -- Sedang disiapkan
  'READY',          -- Siap untuk diambil/dikirim
  'DELIVERING',     -- Kurir dalam perjalanan
  'DELIVERED',      -- Terima oleh pasien
  'CANCELLED'
);

CREATE TYPE fulfillment_type AS ENUM ('PICKUP', 'DELIVERY');

-- ─────────────────────────────────────────────────────────────
-- pharmacies — registered pharmacy partners
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pharmacies (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(255) NOT NULL,
  license_number VARCHAR(100) NOT NULL,
  address       TEXT NOT NULL,
  latitude      NUMERIC(10,7),
  longitude     NUMERIC(10,7),
  phone         VARCHAR(20),
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  operating_hours JSONB,   -- { "monday": { "open": "08:00", "close": "22:00" }, ... }
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_pharmacies_license ON pharmacies (license_number);
CREATE INDEX idx_pharmacies_location ON pharmacies USING GIST (
  ll_to_earth(latitude::float8, longitude::float8)
);
CREATE TRIGGER set_pharmacies_updated_at
  BEFORE UPDATE ON pharmacies FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- drugs — drug master data
-- ─────────────────────────────────────────────────────────────
CREATE TABLE drugs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generic_name     VARCHAR(255) NOT NULL,
  brand_name       VARCHAR(255),
  dosage_form      VARCHAR(100),     -- 'TABLET' | 'SYRUP' | 'INJECTION' | 'CAPSULE'
  strength         VARCHAR(50),      -- '500mg', '10mg/5ml'
  unit             VARCHAR(20),      -- 'tablet', 'ml', 'vial'
  drug_class       VARCHAR(100),
  requires_prescription BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_drugs_name_trgm ON drugs USING GIN (generic_name gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────
-- pharmacy_inventory — stock per pharmacy
-- ─────────────────────────────────────────────────────────────
CREATE TABLE pharmacy_inventory (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pharmacy_id   UUID NOT NULL REFERENCES pharmacies(id) ON DELETE CASCADE,
  drug_id       UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
  stock_qty     INTEGER NOT NULL DEFAULT 0 CHECK (stock_qty >= 0),
  unit_price    NUMERIC(12,2) NOT NULL,
  batch_number  VARCHAR(100),
  expires_at    DATE,
  reorder_level INTEGER NOT NULL DEFAULT 10,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (pharmacy_id, drug_id, batch_number)
);
CREATE INDEX idx_inventory_pharmacy ON pharmacy_inventory (pharmacy_id, drug_id);
CREATE INDEX idx_inventory_expiry   ON pharmacy_inventory (expires_at) WHERE expires_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────
-- prescriptions — issued by doctor in a consultation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE prescriptions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consultation_id  UUID NOT NULL REFERENCES consultations(id) ON DELETE RESTRICT,
  patient_id       UUID NOT NULL REFERENCES patients(id) ON DELETE RESTRICT,
  doctor_id        UUID NOT NULL REFERENCES doctors(id) ON DELETE RESTRICT,
  pharmacy_id      UUID REFERENCES pharmacies(id) ON DELETE SET NULL,
  status           prescription_status NOT NULL DEFAULT 'ISSUED',
  fulfillment_type fulfillment_type,
  delivery_address TEXT,
  notes            TEXT,
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at       TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_prescriptions_patient ON prescriptions (patient_id, issued_at DESC);
CREATE INDEX idx_prescriptions_doctor  ON prescriptions (doctor_id, issued_at DESC);
CREATE INDEX idx_prescriptions_pharmacy ON prescriptions (pharmacy_id, status);
CREATE TRIGGER set_prescriptions_updated_at
  BEFORE UPDATE ON prescriptions FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ─────────────────────────────────────────────────────────────
-- prescription_items — individual drug lines in a prescription
-- ─────────────────────────────────────────────────────────────
CREATE TABLE prescription_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  drug_id          UUID NOT NULL REFERENCES drugs(id) ON DELETE RESTRICT,
  drug_name        VARCHAR(255) NOT NULL,   -- denormalized for history
  dosage           VARCHAR(100) NOT NULL,   -- '1 tablet 3x/day'
  quantity         INTEGER NOT NULL CHECK (quantity > 0),
  instructions     TEXT,
  substitution_allowed BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_prescription_items_rx ON prescription_items (prescription_id);

-- ─────────────────────────────────────────────────────────────
-- prescription_deliveries — delivery tracking
-- ─────────────────────────────────────────────────────────────
CREATE TABLE prescription_deliveries (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id  UUID NOT NULL REFERENCES prescriptions(id) ON DELETE CASCADE,
  courier_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  tracking_code    VARCHAR(100),
  status           VARCHAR(50) NOT NULL DEFAULT 'ASSIGNED',   -- ASSIGNED | PICKED_UP | IN_TRANSIT | DELIVERED
  pickup_at        TIMESTAMPTZ,
  estimated_delivery TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  recipient_signature TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_deliveries_prescription ON prescription_deliveries (prescription_id);
CREATE TRIGGER set_deliveries_updated_at
  BEFORE UPDATE ON prescription_deliveries FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
