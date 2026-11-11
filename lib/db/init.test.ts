import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterAll, describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "./seed-data";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "verde-init-"));
const dbPath = path.join(tempDir, "verde.db");

process.env.DATABASE_PATH = dbPath;
process.env.ADMIN_EMAIL = "boot@verde.local";
process.env.ADMIN_PASSWORD = "boot12345";
process.env.ADMIN_NAME = "Boot Admin";
process.env.SESSION_SECRET = "x".repeat(48);
process.env.SEED_DEMO = "false";

function count(sqlite: Database.Database, table: string): number {
  return (
    sqlite.prepare(`select count(*) as total from ${table}`).get() as {
      total: number;
    }
  ).total;
}

afterAll(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe("primeiro boot", () => {
  it("cria admin, workspace e seeds por workspace de forma idempotente", async () => {
    const { initializeDatabase } = await import("./init");
    initializeDatabase();

    const sqlite = new Database(dbPath, { readonly: true });
    const expectedCategories = DEFAULT_CATEGORIES.reduce(
      (total, category) => total + 1 + (category.filhos?.length ?? 0),
      0,
    );

    expect(count(sqlite, "users")).toBe(1);
    expect(count(sqlite, "workspaces")).toBe(1);
    expect(count(sqlite, "categories")).toBe(expectedCategories);
    expect(count(sqlite, "tags")).toBe(DEFAULT_TAGS.length);

    const admin = sqlite
      .prepare("select email, role, is_admin, ativo, workspace_id from users")
      .get() as {
      email: string;
      role: string;
      is_admin: number;
      ativo: number;
      workspace_id: string;
    };
    expect(admin).toMatchObject({
      email: "boot@verde.local",
      role: "admin",
      is_admin: 1,
      ativo: 1,
    });

    const workspace = sqlite
      .prepare("select id from workspaces where id = ?")
      .get(admin.workspace_id);
    expect(workspace).toBeTruthy();

    const systemCategories = sqlite
      .prepare(
        "select tipo, count(*) as total from categories where is_system = 1 group by tipo",
      )
      .all() as { tipo: string; total: number }[];
    expect(systemCategories).toHaveLength(2);
    expect(systemCategories.every((row) => row.total === 1)).toBe(true);

    sqlite.close();

    // Orçamento legado com data_inicio vazio: deve ser reparado no próximo boot.
    const writer = new Database(dbPath);
    const legacyCategory = writer
      .prepare(
        "select id from categories where nome = 'Mercado' and tipo = 'despesa' limit 1",
      )
      .get() as { id: string } | undefined;
    if (!legacyCategory) throw new Error("categoria Mercado");
    const now = Date.now();
    writer
      .prepare(
        `insert into budgets (id, workspace_id, nome, valor_padrao_centavos, dia_fechamento, antecedencia_ciclos, data_da_reserva, dia_vencimento, origens, conta_id, cartao_id, data_inicio, data_fim, cor, icone, arquivado, created_at, updated_at, categoria_id, mes, valor_limite)
         values ('legacy-budget', ?, 'Legado', 50000, 1, 0, 'inicio_do_ciclo', 1, 'todas', null, null, '', null, '#34d399', 'Target', 0, ?, ?, ?, '2025-03', 50000)`,
      )
      .run(admin.workspace_id, now, now, legacyCategory.id);
    writer.close();

    // Simula um novo boot no mesmo banco: seeds não duplicam nada e a data
    // legada é reparada.
    (globalThis as typeof globalThis & { __verdeDbInitialized?: boolean })
      .__verdeDbInitialized = false;
    initializeDatabase();

    const again = new Database(dbPath, { readonly: true });
    expect(count(again, "users")).toBe(1);
    expect(count(again, "workspaces")).toBe(1);
    expect(count(again, "categories")).toBe(expectedCategories);
    expect(count(again, "tags")).toBe(DEFAULT_TAGS.length);
    expect(
      (
        again
          .prepare("select data_inicio from budgets where id = 'legacy-budget'")
          .get() as { data_inicio: string }
      ).data_inicio,
    ).toBe("2025-03");
    again.close();
  });
});
