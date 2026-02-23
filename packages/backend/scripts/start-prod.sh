#!/bin/sh
set -e

echo "Running migrations..."
node dist/db/migrate.js up

echo "Seeding dev admin user..."
node dist/db/migrate.js seed

echo "Starting backend server..."
exec node dist/index.js
