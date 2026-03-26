import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema.js";

const { Pool, types } = pg;

// node-postgres returns NUMERIC (OID 1700) as strings by default to avoid
// floating-point precision loss. We parse them as JS numbers here because
// our stat values are at most 4-5 significant digits and precision loss is
// not a concern. Without this, arithmetic like (value || 0) + n concatenates
// strings instead of adding numbers.
types.setTypeParser(1700, (val: string) => parseFloat(val));

let db: Kysely<Database> | null = null;

export function createDb(connectionString: string): Kysely<Database> {
  const dialect = new PostgresDialect({
    pool: new Pool({
      connectionString,
      max: 25,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      maxUses: 7500,
    }),
  });

  return new Kysely<Database>({
    dialect,
  });
}

export function getDb(): Kysely<Database> {
  if (!db) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    db = createDb(connectionString);
  }
  return db;
}

export async function closeDb(): Promise<void> {
  if (db) {
    await db.destroy();
    db = null;
  }
}
