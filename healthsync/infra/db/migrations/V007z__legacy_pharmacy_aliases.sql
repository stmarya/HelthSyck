-- Compatibility bridge for two legacy V008 seed prescriptions that reference
-- b000... pharmacy identifiers before the canonical f000... records exist.
-- V014 remaps prescriptions and removes these aliases after all legacy seeds run.
BEGIN;
INSERT INTO pharmacies (id,name,license_number,address,latitude,longitude,phone,is_active)
VALUES
 ('b0000000-0000-0000-0000-000000000001','Legacy Pharmacy Alias 1','LEGACY-B-001','Migration compatibility record',NULL,NULL,NULL,FALSE),
 ('b0000000-0000-0000-0000-000000000002','Legacy Pharmacy Alias 2','LEGACY-B-002','Migration compatibility record',NULL,NULL,NULL,FALSE)
ON CONFLICT (id) DO NOTHING;
COMMIT;
