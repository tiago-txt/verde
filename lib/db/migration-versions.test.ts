import { afterEach, describe, expect, it } from "vitest";
import {
  createPreviousStageDatabase,
  migrateRemaining,
  type TestDatabase,
} from "./testing";

const NOW = Date.now();

let testDb: TestDatabase | null = null;

afterEach(() => {
  testDb?.sqlite.close();
  testDb = null;
});

function seedStage7(db: TestDatabase): void {
  db.sqlite
    .prepare(
      "insert into workspaces (id, nome, created_at) values ('ws-1', 'Workspace', ?)",
    )
    .run(NOW);
  db.sqlite
    .prepare(
      `insert into categories (id, workspace_id, nome, tipo, icone, cor, categoria_pai_id, is_system, created_at, updated_at)
       values ('cat-1', 'ws-1', 'Mercado', 'despesa', 'ShoppingCart', '#84cc16', null, 0, ?, ?)`,
    )
    .run(NOW, NOW);
  db.sqlite
    .prepare(
      `insert into budgets (id, workspace_id, nome, valor_padrao_centavos, dia_fechamento, antecedencia_ciclos, data_da_reserva, dia_vencimento, origens, conta_id, cartao_id, data_inicio, data_fim, cor, icone, arquivado, created_at, updated_at, categoria_id, mes, valor_limite)
       values ('budget-1', 'ws-1', 'Alimentação', 50000, 10, 1, 'vencimento_da_fatura', 20, 'cartao', null, null, '2026-01', null, '#34d399', 'Target', 0, ?, ?, 'cat-1', '2026-01', 50000)`,
    )
    .run(NOW, NOW);
  db.sqlite
    .prepare(
      "insert into budget_categories (workspace_id, budget_id, category_id) values ('ws-1', 'budget-1', 'cat-1')",
    )
    .run();
  db.sqlite
    .prepare(
      `insert into budget_overrides (workspace_id, budget_id, ciclo, valor_centavos, created_at, updated_at)
       values ('ws-1', 'budget-1', '2026-03', 12345, ?, ?)`,
    )
    .run(NOW, NOW);
}

describe("migration 0009 (competência e fechamento do cartão)", () => {
  it("converte o modo removido e adiciona as colunas novas com padrão", () => {
    testDb = createPreviousStageDatabase(8);
    testDb.sqlite
      .prepare(
        "insert into workspaces (id, nome, created_at) values ('ws-1', 'Workspace', ?)",
      )
      .run(NOW);
    testDb.sqlite
      .prepare(
        `insert into categories (id, workspace_id, nome, tipo, icone, cor, categoria_pai_id, is_system, created_at, updated_at)
         values ('cat-1', 'ws-1', 'Mercado', 'despesa', 'ShoppingCart', '#84cc16', null, 0, ?, ?)`,
      )
      .run(NOW, NOW);
    testDb.sqlite
      .prepare(
        `insert into budgets (id, workspace_id, nome, valor_padrao_centavos, dia_fechamento, antecedencia_ciclos, data_da_reserva, dia_vencimento, origens, conta_id, cartao_id, data_inicio, data_fim, cor, icone, arquivado, created_at, updated_at, categoria_id, mes, valor_limite)
         values ('budget-1', 'ws-1', 'Alimentação', 50000, 10, 1, 'vencimento_da_fatura', 20, 'cartao', null, null, '2026-01', null, '#34d399', 'Target', 0, ?, ?, 'cat-1', '2026-01', 50000)`,
      )
      .run(NOW, NOW);

    migrateRemaining(testDb);

    const budget = testDb.sqlite
      .prepare("select data_da_reserva from budgets where id = 'budget-1'")
      .get() as { data_da_reserva: string };
    expect(budget.data_da_reserva).toBe("inicio_do_ciclo");

    const transactionColumns = testDb.sqlite
      .prepare("pragma table_info(transactions)")
      .all() as { name: string; dflt_value: string | null }[];
    expect(
      transactionColumns.find((column) => column.name === "orcamento_deslocamento")
        ?.dflt_value,
    ).toBe("0");
    expect(
      transactionColumns.some((column) => column.name === "cartao_fechamento"),
    ).toBe(true);
    expect(
      transactionColumns.some(
        (column) => column.name === "cartao_fechamento_compra",
      ),
    ).toBe(true);

    const cardColumns = testDb.sqlite
      .prepare("pragma table_info(credit_cards)")
      .all() as { name: string; dflt_value: string | null }[];
    expect(
      cardColumns.find((column) => column.name === "fechamento_compra")
        ?.dflt_value,
    ).toBe("'proxima_fatura'");

    const preferenceColumns = testDb.sqlite
      .prepare("pragma table_info(forecast_preferences)")
      .all() as { name: string }[];
    expect(preferenceColumns.map((column) => column.name)).toEqual(
      expect.arrayContaining([
        "user_id",
        "workspace_id",
        "horizonte",
        "margem",
        "contas",
        "incluir_estimativas",
      ]),
    );

    // Idempotente: reaplicar não muda o valor convertido.
    migrateRemaining(testDb);
    expect(
      (
        testDb.sqlite
          .prepare("select data_da_reserva from budgets where id = 'budget-1'")
          .get() as { data_da_reserva: string }
      ).data_da_reserva,
    ).toBe("inicio_do_ciclo");
  });
});

describe("migration 0008 (versões e exceções de orçamento)", () => {
  it("cria a versão inicial e migra overrides para exceções ajustadas", () => {
    testDb = createPreviousStageDatabase(7);
    seedStage7(testDb);

    migrateRemaining(testDb);

    const version = testDb.sqlite
      .prepare(
        "select vigente_apartir, nome, valor_padrao_centavos, dia_fechamento, antecedencia_ciclos, data_da_reserva, dia_vencimento, origens, categoria_ids from budget_versions where budget_id = 'budget-1'",
      )
      .get() as {
      vigente_apartir: string;
      nome: string;
      valor_padrao_centavos: number;
      dia_fechamento: number;
      antecedencia_ciclos: number;
      data_da_reserva: string;
      dia_vencimento: number;
      origens: string;
      categoria_ids: string;
    };

    expect(version).toMatchObject({
      vigente_apartir: "2026-01",
      nome: "Alimentação",
      valor_padrao_centavos: 50000,
      dia_fechamento: 10,
      antecedencia_ciclos: 1,
      data_da_reserva: "inicio_do_ciclo",
      dia_vencimento: 20,
      origens: "cartao",
    });
    expect(JSON.parse(version.categoria_ids)).toEqual(["cat-1"]);

    const exception = testDb.sqlite
      .prepare(
        "select ciclo, tipo, dados from budget_cycle_exceptions where budget_id = 'budget-1'",
      )
      .get() as { ciclo: string; tipo: string; dados: string };
    expect(exception.ciclo).toBe("2026-03");
    expect(exception.tipo).toBe("ajustado");
    expect(JSON.parse(exception.dados)).toMatchObject({
      valorPadrao: 12345,
    });

    expect(testDb.sqlite.pragma("foreign_key_check")).toEqual([]);

    // Idempotente: reaplicar o migrator não duplica versão/exceção.
    migrateRemaining(testDb);
    expect(
      (
        testDb.sqlite
          .prepare("select count(*) as total from budget_versions")
          .get() as { total: number }
      ).total,
    ).toBe(1);
    expect(
      (
        testDb.sqlite
          .prepare("select count(*) as total from budget_cycle_exceptions")
          .get() as { total: number }
      ).total,
    ).toBe(1);
  });
});
