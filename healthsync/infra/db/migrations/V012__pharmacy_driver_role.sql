-- V012: Separate pharmacy delivery drivers from emergency ambulance drivers.
-- The existing AMBULANCE_DRIVER role remains reserved for ambulance operations.

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PHARMACY_DRIVER';