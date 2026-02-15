#!/bin/sh
# Database migration runner script
# Usage: ./migrate.sh [up|status]

set -e

COMMAND=${1:-up}

# Wait for postgres to be ready
echo "Waiting for PostgreSQL to be ready..."
until pg_isready -h "${PGHOST:-postgres}" -U "${PGUSER:-espn_user}" -d "${PGDATABASE:-espn_fantasy}" > /dev/null 2>&1; do
  sleep 1
done

echo "PostgreSQL is ready!"
echo ""

# Run migrations
cd /app/packages/backend
exec pnpm tsx src/db/migrate.ts "$COMMAND"
