import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { hashSync } from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import {
  drizzle,
  type BetterSQLite3Database,
} from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { getAdminSeed, getSessionSecret } from "@/lib/env";
import { currentMonth } from "@/lib/dates";
import { getDatabasePath } from "./path";
import { seedDemoData } from "./seed-demo";
import { ensureWorkspace, seedWorkspaceDefaults, workspaceNameFor } from "./seed-workspace";
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
    sqlite.pragma("busy_timeout = 5000");

    const db = drizzle(sqlite, { schema });
    const migrationsFolder = path.join(process.cwd(), "drizzle");

    if (!fs.existsSync(migrationsFolder)) {
      throw new Error(
        `Pasta de migrations não encontrada em "${migrationsFolder}". Rode "npm run db:generate" antes de iniciar.`,
      );
    }

    // A migration 0007 reconstrói tabelas para aplicar NOT NULL/FK/unique por
    // workspace. Sem desligar as FKs, os DROP TABLE disparariam cascatas nos
    // dados que estão sendo copiados. O migrator roda dentro de BEGIN, então o
    // PRAGMA precisa ser definido antes dele.
    sqlite.pragma("foreign_keys = OFF");
    try {
      migrate(db, { migrationsFolder });
    } finally {
      sqlite.pragma("foreign_keys = ON");
    }

    const violations = sqlite.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(
        `Migration concluída com ${violations.length} violação(ões) de chave estrangeira.`,
      );
    }

    seed(db);

    globalForDb.__verdeDbInitialized = true;
    console.log(`[verde] Banco pronto em ${dbPath}`);
  } finally {
    sqlite.close();
  }
}

function seed(db: DatabaseInstance): void {
  const adminWorkspaceId = seedFirstAdmin(db);
  repairLegacyBudgetDates(db);

  // Categorias/tags padrão são por workspace. Em bancos migrados os dados
  // existentes já estão no workspace do admin e o seed não duplica nada.
  const workspaceRows = db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .all();
  for (const workspace of workspaceRows) {
    seedWorkspaceDefaults(db, workspace.id);
  }

  if (process.env.SEED_DEMO === "true" && adminWorkspaceId) {
    seedDemoData(db, adminWorkspaceId);
  }
}

/**
 * Orçamentos legados (Etapa 1) podem ter `data_inicio = ''`, o que os deixava
 * invisíveis na lista mas ainda bloqueando categorias no formulário. Repara a
 * data a partir de `mes` (ou do mês atual), de forma idempotente.
 */
function repairLegacyBudgetDates(db: DatabaseInstance): void {
  const fallback = currentMonth();
  db.update(schema.budgets)
    .set({
      dataInicio: sql`case when length(${schema.budgets.mes}) = 7 then ${schema.budgets.mes} else ${fallback} end`,
    })
    .where(eq(schema.budgets.dataInicio, ""))
    .run();
}

function seedFirstAdmin(db: DatabaseInstance): string | null {
  const admin = db
    .select({ workspaceId: schema.users.workspaceId })
    .from(schema.users)
    .where(eq(schema.users.role, "admin"))
    .limit(1)
    .get();
  if (admin) return admin.workspaceId;

  const first = db
    .select({ workspaceId: schema.users.workspaceId })
    .from(schema.users)
    .limit(1)
    .get();
  if (first) return first.workspaceId;

  const adminSeed = getAdminSeed();
  if (!adminSeed) {
    throw new Error(
      "Nenhum usuário cadastrado. Defina ADMIN_EMAIL e ADMIN_PASSWORD nas variáveis de ambiente (.env ou verde.env) para criar o primeiro usuário.",
    );
  }

  const workspaceId = crypto.randomUUID();
  ensureWorkspace(db, workspaceId, workspaceNameFor(adminSeed.nome));

  db.insert(schema.users)
    .values({
      workspaceId,
      nome: adminSeed.nome,
      email: adminSeed.email,
      senhaHash: hashSync(adminSeed.password, 12),
      role: "admin",
      isAdmin: true,
      ativo: true,
      mustChangePassword: false,
    })
    .run();

  console.log(`[verde] Usuário admin criado: ${adminSeed.email}`);
  return workspaceId;
}
