#!/bin/bash
# HealthSync deterministic migration runner.
set -Eeuo pipefail

DB_URL="${DATABASE_URL:-postgresql://healthsync:healthsync_secret@localhost:5432/healthsync}"
MIGRATIONS_DIR="$(cd "$(dirname "$0")/migrations" && pwd)"

psql_cmd=(psql -v ON_ERROR_STOP=1 "$DB_URL")

printf '%s\n' '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' '  HealthSync DB Migrations' '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'

"${psql_cmd[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(255) PRIMARY KEY,
  description TEXT,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);"

shopt -s nullglob
files=("$MIGRATIONS_DIR"/V*.sql)
if ((${#files[@]} == 0)); then
  echo "No migration files found in $MIGRATIONS_DIR" >&2
  exit 1
fi

for file in "${files[@]}"; do
  version=$(basename "$file" .sql)
  applied=$("${psql_cmd[@]}" -Atc "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version='$version');")
  if [[ "$applied" == "t" ]]; then
    echo "  ✓ $version (already applied)"
    continue
  fi
  echo "  → Applying $version..."
  "${psql_cmd[@]}" --single-transaction -f "$file"
  description=$(printf '%s' "$version" | sed -E 's/^V[^_]+__?//' | tr '_' ' ' | sed "s/'/''/g")
  "${psql_cmd[@]}" -c "INSERT INTO schema_migrations(version,description) VALUES ('$version','$description');"
  echo "  ✓ $version applied"
done

echo '  All migrations complete.'
