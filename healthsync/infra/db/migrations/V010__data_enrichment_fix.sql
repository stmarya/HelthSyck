-- V010 was originally a non-idempotent retry for environments where V009 was
-- allowed to fail partially. Migrations are now atomic and stop on first error,
-- so replaying the same seed rows creates duplicate primary keys.
--
-- Keep the version as a compatibility marker. V009 is the canonical atomic
-- enrichment migration; later migrations contain only schema/integrity changes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM doctors WHERE id='00dc0000-0000-0000-0000-000000000006') THEN
    RAISE EXCEPTION 'V009 enrichment is incomplete; restore the database and rerun atomic migrations';
  END IF;
END $$;
