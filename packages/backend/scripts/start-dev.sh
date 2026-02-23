#!/bin/sh
set -e

echo "Reinstalling dependencies to fix symlinks..."
cd /app
CI=true pnpm install --prefer-offline

echo "Building shared package..."
cd /app/packages/shared
pnpm build

echo "Running migrations..."
cd /app/packages/backend
pnpm tsx src/db/migrate.ts up

echo "Seeding dev admin user..."
pnpm tsx src/db/migrate.ts seed

echo "Starting backend server..."
exec pnpm tsx src/index.ts
