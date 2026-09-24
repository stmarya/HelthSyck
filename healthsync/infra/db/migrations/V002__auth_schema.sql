-- V002: Users, roles, and authentication tables
-- Handles multi-role authentication: PATIENT, DOCTOR, COMMAND_CENTER, PHARMACIST, AMBULANCE_DRIVER, ADMIN

-- ─────────────────────────────────────────────────────────────
-- ENUM types
-- ─────────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM (
  'PATIENT',
  'DOCTOR',
  'COMMAND_CENTER',
  'PHARMACIST',
  'AMBULANCE_DRIVER',
  'ADMIN'
);

CREATE TYPE user_status AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'PENDING_VERIFICATION');

-- ─────────────────────────────────────────────────────────────
-- users — core identity table (one row per person)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(255) NOT NULL,
  phone           VARCHAR(20),
  password_hash   TEXT NOT NULL,
  role            user_role NOT NULL DEFAULT 'PATIENT',
  status          user_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
  email_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  phone_verified  BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_email ON users (LOWER(email));
CREATE UNIQUE INDEX idx_users_phone ON users (phone) WHERE phone IS NOT NULL;
CREATE INDEX idx_users_role_status ON users (role, status);

-- ─────────────────────────────────────────────────────────────
-- refresh_tokens — Redis-backed in prod; DB fallback for audit
-- ─────────────────────────────────────────────────────────────
CREATE TABLE refresh_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,           -- SHA-256 hash of actual token
  device_info TEXT,
  ip_address  INET,
  expires_at  TIMESTAMPTZ NOT NULL,
  revoked_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_refresh_tokens_hash ON refresh_tokens (token_hash);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id, expires_at);

-- ─────────────────────────────────────────────────────────────
-- otp_codes — for phone/email verification and password reset
-- ─────────────────────────────────────────────────────────────
CREATE TABLE otp_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash   TEXT NOT NULL,           -- bcrypt hash of 6-digit OTP
  purpose     VARCHAR(50) NOT NULL,    -- 'PHONE_VERIFY' | 'EMAIL_VERIFY' | 'PASSWORD_RESET'
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  attempts    SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_otp_user_purpose ON otp_codes (user_id, purpose, expires_at);

-- ─────────────────────────────────────────────────────────────
-- audit_logs — immutable record of all auth events
-- ─────────────────────────────────────────────────────────────
CREATE TABLE auth_audit_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  event       VARCHAR(100) NOT NULL,   -- LOGIN_SUCCESS | LOGIN_FAIL | LOGOUT | TOKEN_REFRESH | PASSWORD_CHANGE
  ip_address  INET,
  user_agent  TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_audit_user ON auth_audit_logs (user_id, created_at DESC);
CREATE INDEX idx_auth_audit_event ON auth_audit_logs (event, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Trigger: auto-update updated_at on users
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
