-- V001: Enable required PostgreSQL extensions
-- Run once on fresh database

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";       -- uuid_generate_v4()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";         -- gen_random_uuid(), crypt()
CREATE EXTENSION IF NOT EXISTS "pg_trgm";          -- trigram index for name search
CREATE EXTENSION IF NOT EXISTS "btree_gist";       -- GiST index for range types
CREATE EXTENSION IF NOT EXISTS "unaccent";         -- accent-insensitive search
CREATE EXTENSION IF NOT EXISTS "timescaledb" CASCADE;  -- time-series for vitals
