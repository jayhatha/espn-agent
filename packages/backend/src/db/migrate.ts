/**
 * Database Migration Runner
 *
 * Tracks and applies SQL migrations in order.
 * Creates a migrations table to track which migrations have been applied.
 *
 * Usage:
 *   pnpm tsx src/db/migrate.ts        # Apply pending migrations
 *   pnpm tsx src/db/migrate.ts up     # Apply pending migrations
 *   pnpm tsx src/db/migrate.ts status # Show migration status
 */

import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface MigrationFile {
  filename: string;
  filepath: string;
  version: number;
}

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://espn_user:espn_password@localhost:5432/espn_fantasy";

/**
 * Ensures the migrations tracking table exists
 */
async function ensureMigrationsTable(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      version INTEGER NOT NULL UNIQUE,
      filename TEXT NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  console.log("✓ Migrations tracking table ready");
}

/**
 * Gets set of applied migration versions
 */
async function getAppliedVersions(pool: pg.Pool): Promise<Set<number>> {
  const result = await pool.query<{ version: number }>(
    "SELECT version FROM schema_migrations ORDER BY version",
  );
  return new Set(result.rows.map((row) => row.version));
}

/**
 * Gets list of migration files from filesystem
 */
function getMigrationFiles(): MigrationFile[] {
  const migrationsDir = path.join(__dirname, "migrations");

  if (!fs.existsSync(migrationsDir)) {
    console.log("No migrations directory found.");
    return [];
  }

  const files = fs.readdirSync(migrationsDir);
  const migrations: MigrationFile[] = [];

  for (const filename of files) {
    if (!filename.endsWith(".sql")) continue;

    // Extract version number from filename (e.g., "001_initial_schema.sql" -> 1)
    const match = filename.match(/^(\d+)_/);
    if (!match) {
      console.warn(`⚠ Skipping file with invalid name: ${filename}`);
      continue;
    }

    const version = parseInt(match[1], 10);
    migrations.push({
      filename,
      filepath: path.join(migrationsDir, filename),
      version,
    });
  }

  // Sort by version number
  migrations.sort((a, b) => a.version - b.version);

  return migrations;
}

/**
 * Applies a single migration within a transaction
 */
async function applyMigration(
  pool: pg.Pool,
  migration: MigrationFile,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Read and execute migration SQL
    const sql = fs.readFileSync(migration.filepath, "utf-8");
    console.log(`  Running: ${migration.filename}`);
    await client.query(sql);

    // Record migration as applied
    await client.query(
      "INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)",
      [migration.version, migration.filename],
    );

    await client.query("COMMIT");
    console.log(`  ✓ Applied: ${migration.filename}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Main migration runner - applies pending migrations
 */
async function runMigrations(): Promise<void> {
  console.log("=== Database Migration Runner ===\n");
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]*@/, ":****@")}\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Test connection
    await pool.query("SELECT 1");

    // Ensure migrations table exists
    await ensureMigrationsTable(pool);

    // Get applied migrations
    const appliedVersions = await getAppliedVersions(pool);
    console.log(`✓ Found ${appliedVersions.size} applied migration(s)\n`);

    // Get migration files
    const migrationFiles = getMigrationFiles();
    console.log(`✓ Found ${migrationFiles.length} migration file(s)\n`);

    if (migrationFiles.length === 0) {
      console.log("No migrations to run.");
      return;
    }

    // Find pending migrations
    const pendingMigrations = migrationFiles.filter(
      (m) => !appliedVersions.has(m.version),
    );

    if (pendingMigrations.length === 0) {
      console.log("✓ Database is up to date. No pending migrations.\n");
      return;
    }

    console.log(`Found ${pendingMigrations.length} pending migration(s):\n`);
    pendingMigrations.forEach((m) => {
      console.log(`  - ${m.filename}`);
    });
    console.log();

    // Apply each pending migration
    for (const migration of pendingMigrations) {
      await applyMigration(pool, migration);
    }

    console.log("\n✓ All migrations applied successfully!\n");
  } catch (error) {
    console.error("\n✗ Migration failed:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Show migration status - which are applied, which are pending
 */
async function showStatus(): Promise<void> {
  console.log("=== Migration Status ===\n");
  console.log(`Database: ${DATABASE_URL.replace(/:[^:@]*@/, ":****@")}\n`);

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // Test connection
    await pool.query("SELECT 1");

    await ensureMigrationsTable(pool);

    const appliedVersions = await getAppliedVersions(pool);
    const migrationFiles = getMigrationFiles();

    console.log("Applied Migrations:");
    if (appliedVersions.size === 0) {
      console.log("  (none)");
    } else {
      const applied = migrationFiles.filter((m) =>
        appliedVersions.has(m.version),
      );
      applied.forEach((m) => {
        console.log(`  ✓ ${m.filename}`);
      });
    }

    console.log("\nPending Migrations:");
    const pending = migrationFiles.filter(
      (m) => !appliedVersions.has(m.version),
    );
    if (pending.length === 0) {
      console.log("  (none)");
    } else {
      pending.forEach((m) => {
        console.log(`  ⏳ ${m.filename}`);
      });
    }

    console.log();
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

/**
 * Mark a migration as applied without running it
 * Useful when tables already exist from manual creation
 */
async function markAsApplied(version: number): Promise<void> {
  console.log("=== Mark Migration as Applied ===\n");

  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    await pool.query("SELECT 1");
    await ensureMigrationsTable(pool);

    const migrationFiles = getMigrationFiles();
    const migration = migrationFiles.find((m) => m.version === version);

    if (!migration) {
      console.error(`✗ Migration with version ${version} not found`);
      process.exit(1);
    }

    const appliedVersions = await getAppliedVersions(pool);
    if (appliedVersions.has(version)) {
      console.log(
        `✓ Migration ${migration.filename} is already marked as applied`,
      );
      return;
    }

    await pool.query(
      "INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)",
      [version, migration.filename],
    );

    console.log(`✓ Marked ${migration.filename} as applied (without running it)`);
    console.log(
      "  ⚠ Warning: Ensure the database schema actually matches this migration!\n",
    );
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// CLI handler
const command = process.argv[2];
const arg = process.argv[3];

if (command === "status") {
  showStatus().catch((error) => {
    console.error("Status check failed:", error);
    process.exit(1);
  });
} else if (command === "up" || !command) {
  runMigrations().catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
} else if (command === "mark-applied") {
  if (!arg) {
    console.error("Error: Version number required");
    console.error("Usage: tsx migrate.ts mark-applied <version>");
    process.exit(1);
  }
  const version = parseInt(arg, 10);
  if (isNaN(version)) {
    console.error("Error: Version must be a number");
    process.exit(1);
  }
  markAsApplied(version).catch((error) => {
    console.error("Mark failed:", error);
    process.exit(1);
  });
} else {
  console.error("Usage: tsx migrate.ts [command]");
  console.error("Commands:");
  console.error("  up (default)       Apply pending migrations");
  console.error("  status             Show migration status");
  console.error("  mark-applied <ver> Mark migration as applied without running");
  process.exit(1);
}

export { runMigrations, showStatus, markAsApplied };
