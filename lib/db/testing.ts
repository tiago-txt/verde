import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { hashSync } from "bcryptjs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { seedWorkspaceDefaults, workspaceNameFor } from "./seed-workspace";
import type { UserRole } from "./schema";

export type TestDatabase = {
  db: BetterSQLite3Database<typeof schema>;
  sqlite: Database.Database;
};

const globalForDb = globalThis as typeof globalThis & {
  __verdeDb?: TestDatabase;
};

/** Cria um SQLite em memória com todas as migrations aplicadas. */
export function createTestDatabase(): TestDatabase {
  const sqlite = new Database(":memory:");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema });

  sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }

  return { db, sqlite };
}

export function installTestDatabase(testDb: TestDatabase): void {
  globalForDb.__verdeDb = testDb;
}

export function resetTestDatabase(): void {
  globalForDb.__verdeDb?.sqlite.close();
  delete globalForDb.__verdeDb;
}

export type TestUser = {
  id: string;
  workspaceId: string;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
};

/** Cria workspace + usuário + categorias/tags padrão. */
export function createWorkspaceUser(
  testDb: TestDatabase,
  options: {
    nome: string;
    email: string;
    role?: UserRole;
    ativo?: boolean;
    mustChangePassword?: boolean;
  },
): TestUser {
  const id = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();

  testDb.db.transaction((tx) => {
    tx.insert(schema.workspaces)
      .values({ id: workspaceId, nome: workspaceNameFor(options.nome) })
      .run();
    tx.insert(schema.users)
      .values({
        id,
        workspaceId,
        nome: options.nome,
        email: options.email,
        senhaHash: hashSync("senha12345", 4),
        role: options.role ?? "membro",
        isAdmin: (options.role ?? "membro") === "admin",
        ativo: options.ativo ?? true,
        mustChangePassword: options.mustChangePassword ?? false,
      })
      .run();
  });

  seedWorkspaceDefaults(testDb.db, workspaceId);

  return {
    id,
    workspaceId,
    nome: options.nome,
    email: options.email,
    role: options.role ?? "membro",
    ativo: options.ativo ?? true,
  };
}

/** Aplica apenas as migrations 0000..0006 (banco da etapa anterior). */
export function createPreviousStageDatabase(
  upToIndex = 6,
): TestDatabase {
  const root = process.cwd();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verde-migrations-"));
  fs.mkdirSync(path.join(tmp, "meta"), { recursive: true });

  const journal = JSON.parse(
    fs.readFileSync(path.join(root, "drizzle", "meta", "_journal.json"), "utf8"),
  ) as { entries: { idx: number; tag: string }[]; [key: string]: unknown };
  journal.entries = journal.entries.filter((entry) => entry.idx <= upToIndex);
  fs.writeFileSync(
    path.join(tmp, "meta", "_journal.json"),
    JSON.stringify(journal),
  );
  for (const entry of journal.entries) {
    fs.copyFileSync(
      path.join(root, "drizzle", `${entry.tag}.sql`),
      path.join(tmp, `${entry.tag}.sql`),
    );
  }

  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: tmp });
  fs.rmSync(tmp, { recursive: true, force: true });

  return { db, sqlite };
}

/** Aplica as migrations pendentes (ex.: 0007) com FKs desligadas. */
export function migrateRemaining(testDb: TestDatabase): void {
  testDb.sqlite.pragma("foreign_keys = OFF");
  try {
    migrate(testDb.db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
  } finally {
    testDb.sqlite.pragma("foreign_keys = ON");
  }
}
