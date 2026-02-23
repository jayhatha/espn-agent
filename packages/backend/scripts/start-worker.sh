#!/bin/sh
set -e

echo "Reinstalling dependencies to fix symlinks..."
cd /app
CI=true pnpm install --prefer-offline

echo "Building shared package..."
cd /app/packages/shared
pnpm build

echo "Starting worker..."
cd /app/packages/backend
exec pnpm tsx src/workers/snapshot-worker.ts
