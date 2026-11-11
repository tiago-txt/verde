import { afterEach, describe, expect, it } from "vitest";
import {
  createPreviousStageDatabase,
  migrateRemaining,
  type TestDatabase,
} from "./testing";

const NOW = Date.now();
const ADMIN_WORKSPACE = "00000000-0000-4000-8000-000000000001";

function seedPreviousStage(testDb: TestDatabase): void {
  const db = testDb.sqlite;

  db.prepare(
    `insert into users (id, nome, email, senha_hash, is_admin, created_at, updated_at)
     values ('user-admin', 'Admin Antigo', 'admin@verde.local', 'hash', 1, ?, ?)`,
  ).run(NOW, NOW);

  db.prepare(
    `insert into accounts (id, nome, tipo, saldo_inicial, cor, icone, arquivada, created_at, updated_at)
     values ('acc-1', 'Conta Antiga', 'corrente', 100000, '#34d399', 'Wallet', 0, ?, ?)`,
  ).run(NOW, NOW);

  db.prepare(
    `insert into credit_cards (id, nome, bandeira, limite, dia_fechamento, dia_vencimento, conta_pagamento_id, cor, icone, arquivado, created_at, updated_at)
     values ('card-1', 'Cartão Antigo', 'visa', 500000, 10, 17, 'acc-1', '#818cf8', 'CreditCard', 0, ?, ?)`,
  ).run(NOW, NOW);

  db.prepare(
    `insert into categories (id, nome, tipo, icone, cor, categoria_pai_id, is_system, created_at, updated_at)
     values ('cat-outros-d', 'Outros', 'despesa', 'CircleEllipsis', '#94a3b8', null, 1, ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `insert into categories (id, nome, tipo, icone, cor, categoria_pai_id, is_system, created_at, updated_at)
     values ('cat-outros-r', 'Outros', 'receita', 'CirclePlus', '#94a3b8', null, 1, ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `insert into categories (id, nome, tipo, icone, cor, categoria_pai_id, is_system, created_at, updated_at)
     values ('cat-mercado', 'Mercado', 'despesa', 'ShoppingCart', '#84cc16', null, 0, ?, ?)`,
  ).run(NOW, NOW);

  db.prepare(
    `insert into tags (id, nome, created_at) values ('tag-1', 'Fixo', ?)`,
  ).run(NOW);

  db.prepare(
    `insert into recurrences (id, frequencia, data_inicio, data_fim, ativo, template, created_at, updated_at)
     values ('rec-1', 'mensal', '2026-01-05', null, 1, '{"tipo":"despesa","descricao":"Aluguel","valor":1000,"contaId":"acc-1","cartaoId":null,"contaDestinoId":null,"categoriaId":"cat-mercado","observacao":null,"tagIds":[],"pago":false}', ?, ?)`,
  ).run(NOW, NOW);

  db.prepare(
    `insert into transactions (id, tipo, descricao, valor, data, pago, conta_id, categoria_id, recorrencia_id, created_at, updated_at)
     values ('tx-1', 'despesa', 'Mercado', 5000, '2026-01-10', 1, 'acc-1', 'cat-mercado', null, ?, ?)`,
  ).run(NOW, NOW);
  db.prepare(
    `insert into transactions (id, tipo, descricao, valor, data, pago, cartao_id, categoria_id, created_at, updated_at)
     values ('tx-card', 'despesa', 'Compra no cartão', 7000, '2026-01-12', 0, 'card-1', 'cat-mercado', ?, ?)`,
  ).run(NOW, NOW);

  db.prepare(
    `insert into transaction_tags (transaction_id, tag_id) values ('tx-1', 'tag-1')`,
  ).run();

  db.prepare(
    `insert into budgets (id, nome, valor_padrao_centavos, dia_fechamento, antecedencia_ciclos, data_da_reserva, dia_vencimento, origens, conta_id, cartao_id, data_inicio, data_fim, cor, icone, arquivado, created_at, updated_at, categoria_id, mes, valor_limite)
     values ('budget-1', 'Mercado', 50000, 1, 0, 'inicio_do_ciclo', 1, 'todas', 'acc-1', null, '2026-01', null, '#34d399', 'Target', 0, ?, ?, 'cat-mercado', '2026-01', 50000)`,
  ).run(NOW, NOW);

  db.prepare(
    `insert into budget_categories (budget_id, category_id) values ('budget-1', 'cat-mercado')`,
  ).run();
  db.prepare(
    `insert into budget_overrides (budget_id, ciclo, valor_centavos, created_at, updated_at)
     values ('budget-1', '2026-02', 55000, ?, ?)`,
  ).run(NOW, NOW);
}

let testDb: TestDatabase | null = null;

afterEach(() => {
  testDb?.sqlite.close();
  testDb = null;
});

describe("migration 0007 (workspaces)", () => {
  it("migra todos os dados da etapa anterior para o workspace do admin", () => {
    testDb = createPreviousStageDatabase();
    seedPreviousStage(testDb);

    migrateRemaining(testDb);

    const count = (table: string) =>
      (
        testDb!.sqlite
          .prepare(`select count(*) as total from ${table}`)
          .get() as { total: number }
      ).total;

    expect(count("workspaces")).toBe(1);
    expect(count("users")).toBe(1);
    expect(count("accounts")).toBe(1);
    expect(count("credit_cards")).toBe(1);
    expect(count("categories")).toBe(3);
    expect(count("tags")).toBe(1);
    expect(count("recurrences")).toBe(1);
    expect(count("transactions")).toBe(2);
    expect(count("transaction_tags")).toBe(1);
    expect(count("budgets")).toBe(1);
    expect(count("budget_categories")).toBe(1);
    expect(count("budget_overrides")).toBe(1);

    for (const table of [
      "users",
      "accounts",
      "credit_cards",
      "categories",
      "tags",
      "recurrences",
      "transactions",
      "transaction_tags",
      "budgets",
      "budget_categories",
      "budget_overrides",
    ]) {
      const row = testDb.sqlite
        .prepare(
          `select count(*) as total from ${table} where workspace_id = ?`,
        )
        .get(ADMIN_WORKSPACE) as { total: number };
      expect(row.total, table).toBe(count(table));
    }

    const admin = testDb.sqlite
      .prepare("select role, ativo, is_admin, must_change_password from users where id = 'user-admin'")
      .get() as {
      role: string;
      ativo: number;
      is_admin: number;
      must_change_password: number;
    };
    expect(admin).toEqual({
      role: "admin",
      ativo: 1,
      is_admin: 1,
      must_change_password: 0,
    });

    // "Outros" continua uma por tipo no workspace.
    const system = testDb.sqlite
      .prepare(
        "select tipo, count(*) as total from categories where is_system = 1 group by tipo",
      )
      .all() as { tipo: string; total: number }[];
    expect(system.every((row) => row.total === 1)).toBe(true);

    expect(testDb.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("é idempotente ao rodar as migrations novamente", () => {
    testDb = createPreviousStageDatabase();
    seedPreviousStage(testDb);
    migrateRemaining(testDb);

    const before = testDb.sqlite
      .prepare("select count(*) as total from transactions")
      .get() as { total: number };
    const workspacesBefore = testDb.sqlite
      .prepare("select count(*) as total from workspaces")
      .get() as { total: number };

    migrateRemaining(testDb);

    expect(
      (
        testDb.sqlite
          .prepare("select count(*) as total from transactions")
          .get() as { total: number }
      ).total,
    ).toBe(before.total);
    expect(
      (
        testDb.sqlite
          .prepare("select count(*) as total from workspaces")
          .get() as { total: number }
      ).total,
    ).toBe(workspacesBefore.total);
  });

  it("aplica unicidade por workspace sem conflitar entre workspaces", () => {
    testDb = createPreviousStageDatabase();
    seedPreviousStage(testDb);
    migrateRemaining(testDb);

    const db = testDb.sqlite;
    db.prepare(
      "insert into workspaces (id, nome, created_at) values ('ws-2', 'Outro', ?)",
    ).run(NOW);
    db.prepare(
      "insert into tags (id, workspace_id, nome, created_at) values ('tag-2', 'ws-2', 'Fixo', ?)",
    ).run(NOW);

    expect(() =>
      db
        .prepare(
          "insert into tags (id, workspace_id, nome, created_at) values ('tag-3', 'ws-2', 'Fixo', ?)",
        )
        .run(NOW),
    ).toThrow();
  });
});
