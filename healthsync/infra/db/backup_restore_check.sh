#!/usr/bin/env bash
# Verify that a migrated PostgreSQL database can be backed up and restored.
# Intended for CI and staging validation; it never touches a production database
# unless DATABASE_URL is explicitly pointed at one.
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
RESTORE_DB="${RESTORE_DB:-healthsync_restore_check}"
BACKUP_FILE="${BACKUP_FILE:-$(mktemp "${TMPDIR:-/tmp}/healthsync-db-XXXXXX.dump")}"
TOC_FILE="$(mktemp "${TMPDIR:-/tmp}/healthsync-db-XXXXXX.toc")"

if [[ ! "$RESTORE_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "RESTORE_DB must be a simple PostgreSQL identifier" >&2
  exit 2
fi

base_url="${DATABASE_URL%/*}"
maintenance_url="${base_url}/postgres"
restore_url="${base_url}/${RESTORE_DB}"

cleanup() {
  psql "$maintenance_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";" >/dev/null 2>&1 || true
  rm -f "$BACKUP_FILE" "$TOC_FILE" "${TOC_FILE}.filtered"
}
trap cleanup EXIT

psql --version
pg_dump --version
pg_restore --version
printf 'Creating custom-format logical backup: %s\n' "$BACKUP_FILE"
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file="$BACKUP_FILE"
test -s "$BACKUP_FILE"
sha256sum "$BACKUP_FILE"

psql "$maintenance_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";"
psql "$maintenance_url" -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$RESTORE_DB\";"
psql "$maintenance_url" -v ON_ERROR_STOP=1 -c "ALTER DATABASE \"$RESTORE_DB\" SET search_path TO public, pg_catalog;"

# Restore in explicit sections. This lets required extensions exist before
# post-data indexes such as hospitals.location are recreated.
PGOPTIONS="-c search_path=public,pg_catalog" pg_restore --dbname="$restore_url" --section=pre-data --no-owner --no-privileges --exit-on-error "$BACKUP_FILE"
psql "$restore_url" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS timescaledb; CREATE EXTENSION IF NOT EXISTS cube; CREATE EXTENSION IF NOT EXISTS earthdistance;" >/dev/null
psql "$restore_url" -v ON_ERROR_STOP=1 -c "SELECT timescaledb_pre_restore();" >/dev/null
PGOPTIONS="-c search_path=public,pg_catalog" pg_restore --dbname="$restore_url" --section=data --no-owner --no-privileges --exit-on-error "$BACKUP_FILE"
psql "$restore_url" -v ON_ERROR_STOP=1 -c "SELECT timescaledb_post_restore();" >/dev/null
psql "$restore_url" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS cube; CREATE EXTENSION IF NOT EXISTS earthdistance;" >/dev/null

# TimescaleDB does not accept pg_restore's `ALTER TABLE ONLY` form for
# constraints on the alerts hypertable. Filter those TOC entries, then
# recreate the same constraints with supported non-ONLY forms below.
pg_restore --list "$BACKUP_FILE" > "$TOC_FILE"
grep -v -E 'alerts_pkey|alerts_.*_fkey|idx_.*_location' "$TOC_FILE" > "${TOC_FILE}.filtered"
PGOPTIONS="-c search_path=public,pg_catalog" pg_restore --dbname="$restore_url" --section=post-data --use-list="${TOC_FILE}.filtered" --no-owner --no-privileges --exit-on-error "$BACKUP_FILE"
psql "$restore_url" -v ON_ERROR_STOP=1 -c "ALTER TABLE alerts ADD CONSTRAINT alerts_pkey PRIMARY KEY (id, created_at); ALTER TABLE alerts ADD CONSTRAINT alerts_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE; ALTER TABLE alerts ADD CONSTRAINT alerts_acknowledged_by_fkey FOREIGN KEY (acknowledged_by) REFERENCES users(id) ON DELETE SET NULL;" >/dev/null
PGOPTIONS="-c search_path=public,pg_catalog" psql "$restore_url" -v ON_ERROR_STOP=1 -c "CREATE INDEX idx_hospitals_location ON public.hospitals USING gist (public.ll_to_earth((latitude)::double precision, (longitude)::double precision)); CREATE INDEX idx_pharmacies_location ON public.pharmacies USING gist (public.ll_to_earth((latitude)::double precision, (longitude)::double precision));" >/dev/null

restored_tables="$(psql "$restore_url" -Atc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")"
restored_alert_pk="$(psql "$restore_url" -Atc "SELECT COUNT(*) FROM pg_constraint WHERE conrelid='alerts'::regclass AND conname='alerts_pkey';")"
if [[ "$restored_tables" -lt 1 || "$restored_alert_pk" -ne 1 ]]; then
  echo "Restore completed but critical schema checks failed" >&2
  exit 1
fi
printf 'Backup/restore verification passed: %s public tables restored; alerts_pkey verified.\n' "$restored_tables"
