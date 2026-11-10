import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { hashSync } from "bcryptjs";
import { sql } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getAdminSeed, getSessionSecret } from "@/lib/env";
import { getDatabasePath } from "./path";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "./seed-data";
import * as schema from "./schema";

type DatabaseInstance = BetterSQLite3Database<typeof schema>;

type GlobalWithInit = typeof globalThis & {
  __verdeDbInitialized?: boolean;
};

const globalForDb = globalThis as GlobalWithInit;

/**
 * Abre o SQLite, aplica migrations pendentes e roda os seeds idempotentes.
 * Chamado no boot (instrumentation) e, por segurança, no primeiro acesso
 * ao banco em cada processo.
 */
export function initializeDatabase(): void {
  if (globalForDb.__verdeDbInitialized) return;

  // Falha cedo (e de forma visível no healthcheck) se o segredo estiver ausente.
  getSessionSecret();

  const dbPath = getDatabasePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");

    const db = drizzle(sqlite, { schema });
    const migrationsFolder = path.join(process.cwd(), "drizzle");

    if (!fs.existsSync(migrationsFolder)) {
      throw new Error(
        `Pasta de migrations não encontrada em "${migrationsFolder}". Rode "npm run db:generate" antes de iniciar.`,
      );
    }

    migrate(db, { migrationsFolder });
    seed(db);

    globalForDb.__verdeDbInitialized = true;
    console.log(`[verde] Banco pronto em ${dbPath}`);
  } finally {
    sqlite.close();
  }
}

function seed(db: DatabaseInstance): void {
  seedFirstAdmin(db);
  seedCategories(db);
  seedTags(db);
}

function seedFirstAdmin(db: DatabaseInstance): void {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.users)
    .get();
  const count = result?.count ?? 0;
  if (count > 0) return;

  const admin = getAdminSeed();
  if (!admin) {
    throw new Error(
      "Nenhum usuário cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD nas variáveis de ambiente (.env ou verde.env) para criar o primeiro usuário.",
    );
  }

  db.insert(schema.users)
    .values({
      nome: admin.nome,
      email: admin.email,
      senhaHash: hashSync(admin.password, 12),
      isAdmin: true,
    })
    .run();

  console.log(`[verde] Usuário admin criado: ${admin.email}`);
}

function seedCategories(db: DatabaseInstance): void {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.categories)
    .get();
  if ((result?.count ?? 0) > 0) return;

  db.transaction((tx) => {
    for (const category of DEFAULT_CATEGORIES) {
      const parentId = crypto.randomUUID();
      tx.insert(schema.categories)
        .values({
          id: parentId,
          nome: category.nome,
          tipo: category.tipo,
          icone: category.icone,
          cor: category.cor,
        })
        .run();

      for (const child of category.filhos ?? []) {
        tx.insert(schema.categories)
          .values({
            id: crypto.randomUUID(),
            nome: child.nome,
            tipo: category.tipo,
            icone: child.icone,
            cor: child.cor,
            categoriaPaiId: parentId,
          })
          .run();
      }
    }
  });

  console.log("[verde] Categorias padrão criadas");
}

function seedTags(db: DatabaseInstance): void {
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(schema.tags)
    .get();
  if ((result?.count ?? 0) > 0) return;

  db.insert(schema.tags)
    .values(DEFAULT_TAGS.map((nome) => ({ nome })))
    .run();
}
