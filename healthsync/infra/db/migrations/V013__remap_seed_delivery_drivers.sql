-- V013: Remap the original delivery-driver seed accounts.
-- Users 004...001-003 were used by the pharmacy delivery module; users
-- 004...004-005 remain emergency ambulance drivers.

UPDATE users
SET role = 'PHARMACY_DRIVER'::user_role
WHERE id IN (
  '00400000-0000-0000-0000-000000000001',
  '00400000-0000-0000-0000-000000000002',
  '00400000-0000-0000-0000-000000000003'
)
  AND role = 'AMBULANCE_DRIVER'::user_role;