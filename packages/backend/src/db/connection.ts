import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import type { Database } from "./schema.js";

const { Pool } = pg;

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
