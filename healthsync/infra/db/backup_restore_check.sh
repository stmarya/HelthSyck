#!/usr/bin/env bash
# Verify that a migrated PostgreSQL database can be backed up and restored.
# Intended for CI and staging validation; it never touches a production database
# unless DATABASE_URL is explicitly pointed at one.
set -Eeuo pipefail

: "${DATABASE_URL:?DATABASE_URL must be set}"
RESTORE_DB="${RESTORE_DB:-healthsync_restore_check}"
BACKUP_FILE="${BACKUP_FILE:-$(mktemp "${TMPDIR:-/tmp}/healthsync-db-XXXXXX.dump")}"

if [[ ! "$RESTORE_DB" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  echo "RESTORE_DB must be a simple PostgreSQL identifier" >&2
  exit 2
fi

base_url="${DATABASE_URL%/*}"
maintenance_url="${base_url}/postgres"
restore_url="${base_url}/${RESTORE_DB}"

cleanup() {
  psql "$maintenance_url" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$RESTORE_DB\";" >/dev/null 2>&1 || true
  rm -f "$BACKUP_FILE"
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
# TimescaleDB requires these hooks so hypertable chunks are restored after
# the hypertable metadata has been recreated.
psql "$restore_url" -v ON_ERROR_STOP=1 -c "SELECT timescaledb_pre_restore();" >/dev/null
pg_restore --dbname="$restore_url" --no-owner --no-privileges --exit-on-error "$BACKUP_FILE"
psql "$restore_url" -v ON_ERROR_STOP=1 -c "SELECT timescaledb_post_restore();" >/dev/null

restored_tables="$(psql "$restore_url" -Atc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';")"
if [[ "$restored_tables" -lt 1 ]]; then
  echo "Restore completed but no public tables were found" >&2
  exit 1
fi
printf 'Backup/restore verification passed: %s public tables restored.\n' "$restored_tables"
