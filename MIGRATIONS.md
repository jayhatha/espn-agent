# Database Migrations

This document describes the database migration system for the ESPN Fantasy Baseball Assistant.

## Overview

The migration system:

- Tracks which migrations have been applied using a `schema_migrations` table
- Runs SQL files in order based on version numbers
- Supports transactional migrations (each migration runs in a transaction)
- Provides status checking to see applied vs pending migrations

## Migration Files

Migrations are stored in `packages/backend/src/db/migrations/` and follow this naming convention:

```
{version}_{description}.sql
```

Examples:

- `001_initial_schema.sql` - Creates core database tables
- `002_add_projections.sql` - Adds projection-related tables
- `003_add_indexes.sql` - Performance indexes

The version number must be:

- Zero-padded (001, 002, etc.)
- Unique
- Sequential (no gaps required)

## Running Migrations

### In Docker (Development)

The easiest way to run migrations is using the docker.sh wrapper:

```bash
# Start the development environment
./docker.sh dev-up

# Run pending migrations
./docker.sh migrate

# Check migration status
./docker.sh shell backend
pnpm tsx src/db/migrate.ts status
```

### Locally (Without Docker)

If running the backend locally:

```bash
cd packages/backend

# Run pending migrations
pnpm run migrate

# Check migration status
pnpm tsx src/db/migrate.ts status
```

### Environment Variables

The migration runner uses the `DATABASE_URL` environment variable:

```bash
# Default (matches docker-compose.dev.yml)
DATABASE_URL=postgresql://espn_user:espn_password@localhost:5432/espn_fantasy

# Or set in .env file
DATABASE_URL=postgresql://username:password@host:port/database
```

## Migration Tracking

Applied migrations are tracked in the `schema_migrations` table:

```sql
CREATE TABLE schema_migrations (
  id SERIAL PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

To see which migrations have been applied:

```sql
SELECT version, filename, applied_at
FROM schema_migrations
ORDER BY version;
```

## Migration Output

### Successful Run

```
=== Database Migration Runner ===

Database: postgresql://espn_user:****@localhost:5432/espn_fantasy

✓ Migrations tracking table ready
✓ Found 0 applied migration(s)

✓ Found 1 migration file(s)

Found 1 pending migration(s):

  - 001_initial_schema.sql

  Running: 001_initial_schema.sql
  ✓ Applied: 001_initial_schema.sql

✓ All migrations applied successfully!
```

### Up to Date

```
=== Database Migration Runner ===

Database: postgresql://espn_user:****@localhost:5432/espn_fantasy

✓ Migrations tracking table ready
✓ Found 1 applied migration(s)

✓ Found 1 migration file(s)

✓ Database is up to date. No pending migrations.
```

### Status Check

```
=== Migration Status ===

Database: postgresql://espn_user:****@localhost:5432/espn_fantasy

✓ Migrations tracking table ready

Applied Migrations:
  ✓ 001_initial_schema.sql

Pending Migrations:
  ⏳ 002_add_indexes.sql
```

## Creating New Migrations

1. Determine the next version number by checking existing migrations:

   ```bash
   ls packages/backend/src/db/migrations/
   ```

2. Create a new SQL file with the next version number:

   ```bash
   touch packages/backend/src/db/migrations/002_add_indexes.sql
   ```

3. Write your SQL DDL statements:

   ```sql
   -- Add performance indexes for frequently queried columns

   CREATE INDEX idx_player_projection_player_id
     ON player_projection(player_id);

   CREATE INDEX idx_league_daily_snapshot_date
     ON league_daily_snapshot(snapshot_date DESC);
   ```

4. Test locally:

   ```bash
   # Check current status
   pnpm tsx src/db/migrate.ts status

   # Apply the migration
   pnpm run migrate
   ```

5. Commit the migration file to version control

## Transaction Handling

Each migration runs within a transaction:

- If the migration succeeds, the transaction commits and the migration is recorded
- If the migration fails, the transaction rolls back and no changes are made
- This ensures the database remains in a consistent state

Example of a failed migration:

```
=== Database Migration Runner ===

Database: postgresql://espn_user:****@localhost:5432/espn_fantasy

✓ Migrations tracking table ready
✓ Found 1 applied migration(s)

✓ Found 2 migration file(s)

Found 1 pending migration(s):

  - 002_bad_migration.sql

  Running: 002_bad_migration.sql

✗ Migration failed: error: syntax error at or near "CRATE"
```

In this case, none of the changes from `002_bad_migration.sql` are applied.

## Best Practices

### DO:

- ✅ Keep migrations small and focused
- ✅ Use descriptive migration filenames
- ✅ Test migrations on a local database first
- ✅ Include both schema changes and data migrations in the same file if needed
- ✅ Add comments explaining complex migrations
- ✅ Use `IF NOT EXISTS` clauses when appropriate

### DON'T:

- ❌ Modify existing migration files after they've been deployed
- ❌ Delete migration files that have been applied
- ❌ Skip version numbers arbitrarily
- ❌ Include application logic in migrations (keep it to SQL DDL/DML)
- ❌ Commit migrations that haven't been tested

## Rollback Strategy

The migration system doesn't include automatic rollback. To rollback:

1. **Preferred**: Write a new migration that undoes the changes

   ```sql
   -- 003_rollback_indexes.sql
   DROP INDEX IF EXISTS idx_player_projection_player_id;
   DROP INDEX IF EXISTS idx_league_daily_snapshot_date;
   ```

2. **Emergency**: Restore from database backup
   ```bash
   # If you have a backup
   pg_restore -d espn_fantasy backup.dump
   ```

## Troubleshooting

### Migration won't run

Check that:

1. PostgreSQL is running and accessible
2. `DATABASE_URL` is set correctly
3. The migration file has a valid name (001_name.sql format)
4. The migration contains valid SQL

### "Migration already applied" error

This means the migration was already recorded in `schema_migrations`. To re-run:

```sql
-- Delete the migration record (use with caution!)
DELETE FROM schema_migrations WHERE version = 2;
```

Then run migrations again.

### Connection errors

```bash
# Test database connection
psql $DATABASE_URL

# Or using Docker
docker-compose -f docker-compose.dev.yml exec postgres psql -U espn_user -d espn_fantasy
```

## Integration with Deployment

### Development Workflow

1. Developer creates migration locally
2. Tests it: `pnpm run migrate`
3. Commits migration file
4. Pushes to repository
5. CI/CD runs migrations on staging
6. After testing, CI/CD runs migrations on production

### Docker Entrypoint Integration

For production, you may want to run migrations automatically on container
start. Add to `start-dev.sh` or `start.sh`:

```bash
#!/bin/sh
set -e

echo "Running migrations..."
pnpm run migrate

echo "Starting server..."
exec pnpm start
```

### Health Checks

The migration runner exits with code 1 on failure, making it suitable for CI/CD:

```bash
# In CI
pnpm run migrate || exit 1
```

## Example Migrations

### Adding a Table

```sql
-- 002_add_user_preferences.sql

CREATE TABLE user_preferences (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  theme TEXT DEFAULT 'light',
  notifications_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
```

### Adding Columns

```sql
-- 003_add_player_metadata.sql

ALTER TABLE player
  ADD COLUMN status TEXT DEFAULT 'active',
  ADD COLUMN injury_status TEXT,
  ADD COLUMN last_updated TIMESTAMP DEFAULT NOW();

CREATE INDEX idx_player_status ON player(status);
```

### Data Migration

```sql
-- 004_populate_default_settings.sql

-- Insert default league settings for existing leagues
INSERT INTO league_settings_version (league_id, effective_date, settings_json)
SELECT
  id,
  created_at::date,
  '{
    "scoring": "h2h_points",
    "roster_size": 25,
    "bench_spots": 5
  }'::jsonb
FROM league
WHERE NOT EXISTS (
  SELECT 1 FROM league_settings_version
  WHERE league_settings_version.league_id = league.id
);
```

## References

- Migration runner: `packages/backend/src/db/migrate.ts`
- Migration files: `packages/backend/src/db/migrations/`
- Docker wrapper: `docker.sh migrate`
- Package script: `pnpm run migrate`
