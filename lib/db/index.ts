import Database from "better-sqlite3";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { initializeDatabase } from "./init";
import { getDatabasePath } from "./path";
import * as schema from "./schema";

type Db = BetterSQLite3Database<typeof schema>;

type GlobalWithDb = typeof globalThis & {
  __verdeDb?: {
    db: Db;
    sqlite: Database.Database;
  };
};

const globalForDb = globalThis as GlobalWithDb;

function openConnection(): { db: Db; sqlite: Database.Database } {
  const sqlite = new Database(getDatabasePath());
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");

  return { db: drizzle(sqlite, { schema }), sqlite };
}

/**
 * Conexão única por processo. Migrations e seed rodam de forma síncrona
 * antes da primeira query.
 */
export function getDb(): Db {
  if (!globalForDb.__verdeDb) {
    initializeDatabase();
    globalForDb.__verdeDb = openConnection();
  }
  return globalForDb.__verdeDb.db;
}

export function getSqlite(): Database.Database {
  getDb();
  // getDb garante que a conexão existe.
  return globalForDb.__verdeDb!.sqlite;
}

export { schema };
