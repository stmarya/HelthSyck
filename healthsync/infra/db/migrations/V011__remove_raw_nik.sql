-- V011: Remove raw NIK storage.
--
-- NIK is accepted at the API boundary only long enough to calculate the
-- uniqueness token. The recoverable identifier must not be retained in the
-- database. IF EXISTS keeps this migration safe for fresh databases where
-- V003 already defines the hardened schema.
ALTER TABLE patients DROP COLUMN IF EXISTS nik;