-- Replace legacy seed aliases with canonical pharmacy IDs and remove aliases.
BEGIN;
UPDATE prescriptions SET pharmacy_id='f0000000-0000-0000-0000-000000000001'
WHERE pharmacy_id='b0000000-0000-0000-0000-000000000001';
UPDATE prescriptions SET pharmacy_id='f0000000-0000-0000-0000-000000000002'
WHERE pharmacy_id='b0000000-0000-0000-0000-000000000002';
DELETE FROM pharmacies WHERE id IN (
 'b0000000-0000-0000-0000-000000000001',
 'b0000000-0000-0000-0000-000000000002'
) AND license_number LIKE 'LEGACY-B-%';
COMMIT;
