#!/bin/bash
# HealthSync — Run all database migrations using psql
# Usage: ./run_migrations.sh
# Requires: DATABASE_URL environment variable OR defaults to local dev

set -e

DB_URL="${DATABASE_URL:-postgresql://healthsync:healthsync_secret@localhost:5432/healthsync}"
MIGRATIONS_DIR="$(dirname "$0")/migrations"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  HealthSync DB Migrations"
echo "  Target: ${DB_URL%%@*}@***"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create migrations tracking table if not exists
psql "$DB_URL" -c "
CREATE TABLE IF NOT EXISTS schema_migrations (
  version      VARCHAR(255) PRIMARY KEY,
  description  TEXT,
  applied_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);" 2>/dev/null || true

# Apply each migration in order
for file in "$MIGRATIONS_DIR"/V*.sql; do
  version=$(basename "$file" .sql)
  
  # Check if already applied
  applied=$(psql "$DB_URL" -t -c "SELECT COUNT(*) FROM schema_migrations WHERE version='$version';" 2>/dev/null | tr -d ' ')
  
  if [ "$applied" = "1" ]; then
    echo "  ✓ $version (already applied)"
    continue
  fi
  
  echo "  → Applying $version..."
  psql "$DB_URL" -f "$file"
  psql "$DB_URL" -c "INSERT INTO schema_migrations (version, description) VALUES ('$version', '$(echo $version | sed 's/V[0-9]*__//' | tr '_' ' ')');"
  echo "  ✓ $version applied"
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  All migrations complete!"
