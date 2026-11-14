import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "./testing";
import { accounts, creditCards, transactions } from "./schema";
import { listAccountsWithBalances } from "./queries/accounts";
import { getCardDebtSnapshot } from "./queries/cards";
import { getDashboardBalance } from "./queries/dashboard";
import {
  getForecastBanner,
  getForecastData,
  getMonthProjection,
  invalidateForecastCache,
} from "./queries/forecast";
import { getDashboardMonth } from "./queries/dashboard";
import { listResultRows } from "./queries/reports";
import { summarizeResult } from "@/lib/finance/result";

let testDb: TestDatabase;
let user: TestUser;
const HOJE = "2026-11-13";
const OPERACIONAL = "conta-operacional";
const INVESTIMENTO = "conta-investimento";
const CARTAO = "cartao-nu";

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Ana",
    email: "ana@example.com",
  });
  seedScenario();
});

afterEach(() => {
  invalidateForecastCache();
  resetTestDatabase();
});

function seedScenario() {
  const now = new Date();
  testDb.db
    .insert(accounts)
    .values([
      {
        id: OPERACIONAL,
        workspaceId: user.workspaceId,
        nome: "Corrente",
        tipo: "corrente",
        saldoInicial: 0,
        cor: "#34d399",
        icone: "Wallet",
        createdAt: now,
        updatedAt: now,
      },
      {
        id: INVESTIMENTO,
        workspaceId: user.workspaceId,
        nome: "Investimento",
        tipo: "investimento",
        saldoInicial: 0,
        cor: "#818cf8",
        icone: "TrendingUp",
        createdAt: now,
        updatedAt: now,
      },
    ])
    .run();

  testDb.db
    .insert(creditCards)
    .values({
      id: CARTAO,
      workspaceId: user.workspaceId,
      nome: "Nu",
      bandeira: "mastercard",
      limite: 500_000,
      diaFechamento: 10,
      diaVencimento: 15,
      contaPagamentoId: OPERACIONAL,
      cor: "#a855f7",
      icone: "CreditCard",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const rows = [
    // 10/11
    tx("receita", 250_000, "2026-11-10", true, { contaId: OPERACIONAL }),
    tx("despesa", 160_000, "2026-11-10", true, { contaId: OPERACIONAL }),
    tx("transferencia", 6_000, "2026-11-10", true, {
      contaId: OPERACIONAL,
      contaDestinoId: INVESTIMENTO,
    }),
    // 11/11
    tx("despesa", 30_000, "2026-11-11", true, { contaId: OPERACIONAL }),
    tx("receita", 12_500, "2026-11-11", true, { contaId: OPERACIONAL }),
    // 12/11
    tx("despesa", 52_300, "2026-11-12", false, { cartaoId: CARTAO }),
    tx("despesa", 2_500, "2026-11-12", true, { contaId: OPERACIONAL }),
    // 13/11
    tx("despesa", 70_000, "2026-11-13", true, { contaId: OPERACIONAL }),
    // 10/12
    tx("receita", 250_000, "2026-12-10", true, { contaId: OPERACIONAL }),
    tx("despesa", 160_000, "2026-12-10", true, { contaId: OPERACIONAL }),
    tx("transferencia", 6_000, "2026-12-10", true, {
      contaId: OPERACIONAL,
      contaDestinoId: INVESTIMENTO,
    }),
    // 12/12 — pagamento da fatura de 523
    tx("transferencia", 52_300, "2026-12-12", true, {
      contaId: OPERACIONAL,
      cartaoDestinoId: CARTAO,
      faturaChave: "2026-12",
    }),
    // 15/12 — compra futura de 800 (fatura 2027-01)
    tx("despesa", 80_000, "2026-12-15", false, { cartaoId: CARTAO }),
  ];

  for (const [index, row] of rows.entries()) {
    testDb.db
      .insert(transactions)
      .values({
        id: `tx-${index}`,
        workspaceId: user.workspaceId,
        descricao: `Lançamento ${index}`,
        orcamentoDeslocamento: 0,
        createdAt: now,
        updatedAt: now,
        ...row,
      })
      .run();
  }
}

function tx(
  tipo: "receita" | "despesa" | "transferencia",
  valor: number,
  data: string,
  pago: boolean,
  extra: {
    contaId?: string;
    contaDestinoId?: string;
    cartaoId?: string;
    cartaoDestinoId?: string;
    faturaChave?: string;
  } = {},
) {
  return {
    tipo,
    valor,
    data,
    pago,
    contaId: extra.contaId ?? null,
    contaDestinoId: extra.contaDestinoId ?? null,
    cartaoId: extra.cartaoId ?? null,
    cartaoDestinoId: extra.cartaoDestinoId ?? null,
    faturaChave: extra.faturaChave ?? null,
  };
}

describe("cenário de referência — novembro/2026", () => {
  it("saldo total em 13/11 = 0 (operacional −60 + investimentos 60)", () => {
    const balances = listAccountsWithBalances(user.workspaceId, {
      referenceDate: HOJE,
    });
    const operacional = balances
      .filter((account) => account.id === OPERACIONAL)
      .reduce((sum, account) => sum + account.saldoAtual, 0);
    const investimentos = balances
      .filter((account) => account.id === INVESTIMENTO)
      .reduce((sum, account) => sum + account.saldoAtual, 0);

    expect(operacional).toBe(-6_000);
    expect(investimentos).toBe(6_000);
    expect(operacional + investimentos).toBe(0);
  });

  it("dívida atual = 523 e patrimônio líquido = −523", () => {
    const debt = getCardDebtSnapshot(user.workspaceId, HOJE);
    expect(debt.currentInvoice).toBe(52_300);
    expect(debt.futureInstallments).toBe(0);
    expect(debt.current).toBe(52_300);
    expect(debt.future).toBe(80_000);
  });

  it("o dashboard usa o escopo total e separa compras futuras", async () => {
    const dashboard = await getDashboardBalance(user.workspaceId, HOJE);
    expect(dashboard.total).toBe(0);
    expect(dashboard.operational).toBe(-6_000);
    expect(dashboard.investments).toBe(6_000);
    expect(dashboard.currentCardDebt).toBe(52_300);
    expect(dashboard.futureCardDebt).toBe(80_000);
    expect(dashboard.netWorth).toBe(-52_300);
  });

  it("resultado de novembro segue a preferência", () => {
    const rows = listResultRows(user.workspaceId, {
      from: "2026-11-01",
      to: "2026-11-30",
    });
    const caixa = summarizeResult(rows, "caixa");
    const competencia = summarizeResult(rows, "competencia");

    expect(caixa.saldo).toBe(0);
    expect(caixa.receitas).toBe(262_500);
    expect(caixa.despesas).toBe(262_500);
    expect(caixa.comprasCartao).toBe(0);

    expect(competencia.saldo).toBe(-52_300);
    expect(competencia.receitas).toBe(262_500);
    expect(competencia.despesas).toBe(314_800);
  });

  it("o dashboard mensal usa a preferência de cartão", async () => {
    const caixa = await getDashboardMonth(
      user.workspaceId,
      "2026-11",
      "caixa",
    );
    const competencia = await getDashboardMonth(
      user.workspaceId,
      "2026-11",
      "competencia",
    );
    expect(caixa.result.saldo).toBe(0);
    expect(competencia.result.saldo).toBe(-52_300);
    // Gastos por categoria sempre por competência.
    expect(caixa.categoryBasis).toBe("competencia");
    expect(caixa.categoryReport.total).toBe(314_800);
  });

  it("a previsão parte do total 0 e não acusa a transferência de 60", () => {
    const data = getForecastData(user.workspaceId, user.id);
    expect(data.projection.saldoInicial).toBe(0);
    expect(
      data.alertas.some(
        (alert) =>
          alert.inicio.slice(0, 7) <= "2026-11" &&
          alert.fim.slice(0, 7) >= "2026-11",
      ),
    ).toBe(false);
    expect(getForecastBanner(user.workspaceId, user.id, "2026-11")).toBeNull();
  });

  it("previsto até fim de novembro/2026 = 0 no escopo total", () => {
    const projection = getMonthProjection(user.workspaceId, "2026-11");
    expect(projection.fim).toBe("2026-11-30");
    expect(projection.modo).toBe("previsto");
    expect(projection.saldo).toBe(0);
  });

  it("a fatura de 800 sai em janeiro/2027, não em novembro/2026", () => {
    const novembro = getMonthProjection(user.workspaceId, "2026-11");
    const dezembro = getMonthProjection(user.workspaceId, "2026-12");
    const janeiro = getMonthProjection(user.workspaceId, "2027-01");

    expect(novembro.saldo).toBe(0);
    // Dezembro recebe a receita/despesa e paga a fatura de 523.
    expect(dezembro.saldo).toBe(37_700);
    // Em janeiro, a fatura de 800 vence.
    expect(janeiro.saldo).toBe(37_700 - 80_000);
  });

  it("mês passado usa fechamento realizado, sem eventos futuros", () => {
    const outubro = getMonthProjection(user.workspaceId, "2026-10");
    expect(outubro.modo).toBe("realizado");
    expect(outubro.saldo).toBe(0);
  });
});
