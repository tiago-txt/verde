// Congela o comportamento aprovado pelo dono; não editar para passar.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { inArray } from "drizzle-orm";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "./testing";
import { accounts, creditCards, transactions } from "./schema";
import { computeAccountBalances } from "@/lib/finance/balance";
import { getForecastData, getMonthProjection } from "./queries/forecast";
import { getDashboardBalance } from "./queries/dashboard";
import { listAccountsWithBalances } from "./queries/accounts";
import {
  getMonthBalances,
  listMonthTransactions,
} from "./queries/transactions";
import {
  getCardDebtSnapshot,
  listCardInvoiceEventsForMonth,
  listCards,
} from "./queries/cards";
import {
  buildFooterBreakdown,
  buildFooterSummary,
  type FooterBreakdownItem,
} from "@/lib/finance/summary-display";
import { summarizeTransactions } from "@/lib/finance/summary";
import { aplicarEventosAoResumo } from "@/lib/finance/budgets";
import { aplicarFaturasAoResumo } from "@/lib/finance/cards";
import type { TransactionFilters } from "@/lib/finance/filters";
import type { CardInvoiceFilters } from "@/lib/finance/cards";

const TODAY = "2026-11-15";

const filters = (
  mes: string,
  overrides: Partial<TransactionFilters> = {},
): TransactionFilters => ({
  mes,
  tipo: null,
  contas: [],
  cartoes: [],
  categorias: [],
  tags: [],
  status: "todos",
  q: null,
  dias: 31,
  detalhe: null,
  comprasCartao: false,
  de: null,
  ate: null,
  ...overrides,
});

const cardFilters = (
  overrides: Partial<CardInvoiceFilters> = {},
): CardInvoiceFilters => ({
  tipo: null,
  cartoes: [],
  contas: [],
  categorias: [],
  tags: [],
  status: "todos",
  q: null,
  ...overrides,
});

let testDb: TestDatabase;
let user: TestUser;

beforeEach(() => {
  // "Hoje" é injetado; nenhum teste depende do relógio da máquina.
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T12:00:00Z`));
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Fixture",
    email: "fixture@verde.local",
    role: "membro",
  });
});

afterEach(() => {
  vi.useRealTimers();
  resetTestDatabase();
});

function insertTransaction(values: {
  tipo: "receita" | "despesa" | "transferencia";
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  contaId?: string | null;
  cartaoId?: string | null;
  cartaoDestinoId?: string | null;
  faturaChave?: string | null;
}) {
  const now = new Date(`${TODAY}T12:00:00Z`);
  testDb.db
    .insert(transactions)
    .values({
      id: crypto.randomUUID(),
      workspaceId: user.workspaceId,
      tipo: values.tipo,
      descricao: values.descricao,
      valor: values.valor,
      data: values.data,
      pago: values.pago,
      contaId: values.contaId ?? null,
      cartaoId: values.cartaoId ?? null,
      contaDestinoId: null,
      cartaoDestinoId: values.cartaoDestinoId ?? null,
      faturaChave: values.faturaChave ?? null,
      categoriaId: null,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function buildFixture() {
  const accountId = crypto.randomUUID();
  testDb.db
    .insert(accounts)
    .values({
      id: accountId,
      workspaceId: user.workspaceId,
      nome: "Conta principal",
      tipo: "corrente",
      saldoInicial: 0,
      cor: "#34d399",
      icone: "Wallet",
      arquivada: false,
      createdAt: new Date(`${TODAY}T12:00:00Z`),
      updatedAt: new Date(`${TODAY}T12:00:00Z`),
    })
    .run();

  const cardSpecs = [
    { nome: "Cartão A", fechamento: 9, vencimento: 15, nov: 10_000, dez: 13_055 },
    { nome: "Cartão B", fechamento: 10, vencimento: 15, nov: 20_000, dez: 69_159 },
    { nome: "Cartão C", fechamento: 9, vencimento: 15, nov: 30_000, dez: 51_487 },
    { nome: "Cartão D", fechamento: 10, vencimento: 15, nov: 40_000, dez: 19_573 },
    { nome: "Cartão E", fechamento: 16, vencimento: 23, nov: 5_000, dez: 8_300 },
  ];

  const cards = cardSpecs.map((spec) => {
    const id = crypto.randomUUID();
    testDb.db
      .insert(creditCards)
      .values({
        id,
        workspaceId: user.workspaceId,
        nome: spec.nome,
        bandeira: "visa",
        limite: 5_000_000,
        diaFechamento: spec.fechamento,
        diaVencimento: spec.vencimento,
        fechamentoCompra: "proxima_fatura",
        contaPagamentoId: accountId,
        cor: "#818cf8",
        icone: "CreditCard",
        arquivado: false,
        createdAt: new Date(`${TODAY}T12:00:00Z`),
        updatedAt: new Date(`${TODAY}T12:00:00Z`),
      })
      .run();

    insertTransaction({
      tipo: "despesa",
      descricao: `Compra de outubro ${spec.nome}`,
      valor: spec.nov,
      data: "2026-10-20",
      pago: false,
      cartaoId: id,
    });
    insertTransaction({
      tipo: "despesa",
      descricao: `Compra de dezembro ${spec.nome}`,
      valor: spec.dez,
      data: "2026-11-20",
      pago: false,
      cartaoId: id,
    });
    insertTransaction({
      tipo: "transferencia",
      descricao: `Pagamento de fatura ${spec.nome}`,
      valor: spec.nome === "Cartão E" ? spec.nov + 8_500 : spec.nov,
      data: "2026-11-10",
      pago: true,
      contaId: accountId,
      cartaoDestinoId: id,
      faturaChave: "2026-11",
    });

    return id;
  });

  insertTransaction({
    tipo: "receita",
    descricao: "Receita recebida",
    valor: 106_700,
    data: "2026-10-01",
    pago: true,
    contaId: accountId,
  });
  insertTransaction({
    tipo: "receita",
    descricao: "Receita de 19/11",
    valor: 110_000,
    data: "2026-11-19",
    pago: true,
    contaId: accountId,
  });
  insertTransaction({
    tipo: "despesa",
    descricao: "Despesa de 20/11",
    valor: 65_000,
    data: "2026-11-20",
    pago: true,
    contaId: accountId,
  });
  insertTransaction({
    tipo: "despesa",
    descricao: "Despesa de novembro 1",
    valor: 30_000,
    data: "2026-11-25",
    pago: false,
    contaId: accountId,
  });
  insertTransaction({
    tipo: "despesa",
    descricao: "Despesa de novembro 2",
    valor: 3_200,
    data: "2026-11-28",
    pago: false,
    contaId: accountId,
  });
  insertTransaction({
    tipo: "receita",
    descricao: "Receita de dezembro",
    valor: 210_000,
    data: "2026-12-05",
    pago: false,
    contaId: accountId,
  });
  insertTransaction({
    tipo: "despesa",
    descricao: "Despesa de dezembro",
    valor: 6_800,
    data: "2026-12-10",
    pago: false,
    contaId: accountId,
  });

  return { accountId, cards };
}

function allTransactions() {
  return testDb.db.select().from(transactions).all();
}

function computeSaldoAtual() {
  const accountRows = testDb.db.select().from(accounts).all();
  const rows = allTransactions().map((row) => ({
    tipo: row.tipo,
    valor: row.valor,
    pago: row.pago,
    contaId: row.contaId,
    contaDestinoId: row.contaDestinoId,
    cartaoId: row.cartaoId,
    cartaoDestinoId: row.cartaoDestinoId,
    faturaChave: row.faturaChave,
    deletedAt: row.deletedAt,
  }));
  return computeAccountBalances(accountRows, rows, "atual");
}

function footerFor(
  mes: string,
  options: {
    overrides?: Partial<TransactionFilters>;
    projected?: boolean;
  } = {},
) {
  const overrides = options.overrides ?? {};
  const projected = options.projected ?? true;
  const list = listMonthTransactions(user.workspaceId, filters(mes, overrides));
  const invoiceEvents = listCardInvoiceEventsForMonth(
    user.workspaceId,
    mes,
    cardFilters({
      tipo: overrides.tipo ?? null,
      cartoes: overrides.cartoes ?? [],
      contas: overrides.contas ?? [],
      categorias: overrides.categorias ?? [],
      tags: overrides.tags ?? [],
      status: overrides.status ?? "todos",
      q: overrides.q ?? null,
    }),
  );
  const summary = aplicarFaturasAoResumo(
    aplicarEventosAoResumo(summarizeTransactions(list), []),
    invoiceEvents,
  );
  const opening = getMonthBalances(user.workspaceId, mes, "realizado").opening;
  const projectedBalance = projected
    ? getMonthProjection(user.workspaceId, mes).saldo
    : undefined;
  return {
    summary,
    opening,
    footer: buildFooterSummary(summary, opening, projectedBalance),
    breakdown: buildFooterBreakdown(summary, opening, projectedBalance),
  };
}

function item(items: FooterBreakdownItem[], id: string) {
  return items.find((entry) => entry.id === id)?.value;
}

describe("caso de referência do dono (15/11/2026)", () => {
  it("congela saldo 382,00, previsto 50,00/466,26 e as 5 faturas", async () => {
    const { accountId } = buildFixture();

    const saldo = computeSaldoAtual();
    expect(saldo.get(accountId)).toBe(38_200);

    const nov = getMonthProjection(user.workspaceId, "2026-11");
    const dez = getMonthProjection(user.workspaceId, "2026-12");
    expect(nov.modo).toBe("previsto");
    expect(nov.saldo).toBe(5_000);
    expect(dez.saldo).toBe(46_626);

    const out = footerFor("2026-10");
    expect(out.footer.saldoAnterior).toBe(0);
    expect(out.footer.saldo).toBe(106_700);
    expect(out.footer.previsto).toBe(106_700);

    const novFooter = footerFor("2026-11");
    expect(novFooter.footer.saldoAnterior).toBe(106_700);
    expect(novFooter.footer.saldo).toBe(38_200);
    expect(novFooter.footer.previsto).toBe(5_000);
    expect(novFooter.footer.totalPrevisto).toBe(-101_700);

    const dezFooter = footerFor("2026-12");
    expect(dezFooter.footer.saldoAnterior).toBe(38_200);
    expect(dezFooter.footer.saldo).toBe(38_200);
    expect(dezFooter.footer.previsto).toBe(46_626);
    expect(dezFooter.footer.totalPrevisto).toBe(41_626);

    const novInvoices = listCardInvoiceEventsForMonth(
      user.workspaceId,
      "2026-11",
      cardFilters(),
    );
    expect(novInvoices.map((invoice) => invoice.restante)).toEqual([
      0, 0, 0, 0, 0,
    ]);
    expect(novInvoices.map((invoice) => invoice.pago)).toEqual([
      10_000, 20_000, 30_000, 40_000, 13_500,
    ]);

    const dezInvoices = listCardInvoiceEventsForMonth(
      user.workspaceId,
      "2026-12",
      cardFilters(),
    );
    expect(dezInvoices.map((invoice) => invoice.restante)).toEqual([
      13_055, 69_159, 51_487, 19_573, 8_300,
    ]);
    expect(
      dezInvoices.reduce((sum, invoice) => sum + invoice.restante, 0),
    ).toBe(161_574);

    const cards = listCards(user.workspaceId);
    const cartaoE = cards.find((card) => card.nome === "Cartão E");
    expect(cartaoE?.currentInvoice.pago).toBe(13_500);
    expect(cartaoE?.currentInvoice.restante).toBe(0);
    expect(cartaoE?.currentInvoice.credito).toBe(8_500);

    // Vias de leitura por data de hoje divergem do "saldo 382" acima:
    // a fixture tem os itens de 19/11 e 20/11 pagos, mas futuros.
    const accountsToday = listAccountsWithBalances(user.workspaceId);
    expect(accountsToday[0]?.saldoAtual).toBe(-6_800);
    expect(accountsToday[0]?.saldoPrevisto).toBe(54_926);

    const dashboard = await getDashboardBalance(user.workspaceId, TODAY);
    expect(dashboard.operational).toBe(-6_800);
    expect(dashboard.total).toBe(-6_800);

    const debt = getCardDebtSnapshot(user.workspaceId, TODAY);
    expect(debt.currentInvoice).toBe(0);
    expect(debt.current).toBe(0);
    expect(debt.future).toBe(153_274);
  });

  it("desmarcar 19/11 e 20/11 muda o saldo para -68,00 e não muda o previsto", () => {
    const { accountId } = buildFixture();

    expect(computeSaldoAtual().get(accountId)).toBe(38_200);
    expect(footerFor("2026-11").footer.saldo).toBe(38_200);
    expect(footerFor("2026-11").footer.previsto).toBe(5_000);

    testDb.db
      .update(transactions)
      .set({ pago: false })
      .where(
        inArray(transactions.descricao, [
          "Receita de 19/11",
          "Despesa de 20/11",
        ]),
      )
      .run();

    expect(computeSaldoAtual().get(accountId)).toBe(-6_800);
    expect(footerFor("2026-11").footer.saldo).toBe(-6_800);
    expect(footerFor("2026-11").footer.previsto).toBe(5_000);
    expect(getMonthProjection(user.workspaceId, "2026-11").saldo).toBe(5_000);
    expect(getMonthProjection(user.workspaceId, "2026-12").saldo).toBe(46_626);
    expect(listAccountsWithBalances(user.workspaceId)[0]?.saldoAtual).toBe(
      -6_800,
    );
  });
});

describe("saldo do dia e rodapé por mês", () => {
  it("congela getMonthBalances para mês passado, atual e futuro", () => {
    buildFixture();

    const outPrev = getMonthBalances(user.workspaceId, "2026-10", "previsto");
    const outReal = getMonthBalances(user.workspaceId, "2026-10", "realizado");
    expect(outPrev.opening).toBe(0);
    expect(outPrev.byDay["2026-10-31"]).toBe(106_700);
    expect(outReal.opening).toBe(0);
    expect(outReal.byDay["2026-10-31"]).toBe(106_700);

    const novPrev = getMonthBalances(user.workspaceId, "2026-11", "previsto");
    const novReal = getMonthBalances(user.workspaceId, "2026-11", "realizado");
    expect(novPrev.opening).toBe(106_700);
    expect(novPrev.byDay["2026-11-15"]).toBe(-6_800);
    expect(novPrev.byDay["2026-11-30"]).toBe(5_000);
    expect(novReal.opening).toBe(106_700);
    expect(novReal.byDay["2026-11-15"]).toBe(-6_800);
    expect(novReal.byDay["2026-11-30"]).toBe(38_200);

    const dezPrev = getMonthBalances(user.workspaceId, "2026-12", "previsto");
    const dezReal = getMonthBalances(user.workspaceId, "2026-12", "realizado");
    expect(dezPrev.opening).toBe(5_000);
    // getMonthBalances não conhece faturas virtuais; o restante entra depois
    // por aplicarEventosAoSalsoDia na página de Lançamentos.
    expect(dezPrev.byDay["2026-12-31"]).toBe(208_200);
    expect(dezReal.opening).toBe(38_200);
    expect(dezReal.byDay["2026-12-31"]).toBe(38_200);
  });

  it("congela buildFooterSummary e buildFooterBreakdown sem filtros", () => {
    buildFixture();

    const out = footerFor("2026-10");
    expect(out.summary.entradasPagas).toBe(106_700);
    expect(out.breakdown.receita[0]).toMatchObject({
      id: "receitas-pagas",
      value: 106_700,
    });
    expect(item(out.breakdown.despesa, "despesas-pagas")).toBe(0);

    const nov = footerFor("2026-11");
    expect(nov.summary.saidasPagas).toBe(178_500);
    expect(nov.summary.pagamentosFatura).toBe(113_500);
    expect(item(nov.breakdown.despesa, "despesas-pagas")).toBe(65_000);
    expect(item(nov.breakdown.despesa, "despesas-a-pagar")).toBe(33_200);
    expect(item(nov.breakdown.despesa, "pagamentos-fatura")).toBe(113_500);
    expect(item(nov.breakdown.despesa, "faturas-restantes")).toBe(0);
    expect(item(nov.breakdown.receita, "receitas-pagas")).toBe(110_000);

    const dez = footerFor("2026-12");
    expect(dez.summary.faturasCartao).toBe(161_574);
    expect(item(dez.breakdown.despesa, "despesas-a-pagar")).toBe(6_800);
    expect(item(dez.breakdown.despesa, "faturas-restantes")).toBe(161_574);
    expect(item(dez.breakdown.receita, "receitas-a-receber")).toBe(210_000);
    expect(
      dez.breakdown.despesa.some((entry) => entry.id === "projecao-acumulada"),
    ).toBe(true);
    expect(item(dez.breakdown.despesa, "projecao-acumulada")).toBe(33_200);
  });

  it("congela o rodapé com filtro (despesas não pagas) nos três meses", () => {
    buildFixture();

    const out = footerFor("2026-10", {
      overrides: { tipo: "despesa", status: "nao_pagos" },
      projected: false,
    });
    expect(out.footer.saldo).toBe(0);
    expect(out.footer.previsto).toBe(0);
    expect(item(out.breakdown.despesa, "despesas-a-pagar")).toBe(0);

    const nov = footerFor("2026-11", {
      overrides: { tipo: "despesa", status: "nao_pagos" },
      projected: false,
    });
    expect(nov.opening).toBe(106_700);
    expect(nov.summary.saidasPagas).toBe(0);
    expect(nov.summary.saidasPrevistas).toBe(33_200);
    expect(nov.footer.saldo).toBe(106_700);
    expect(nov.footer.previsto).toBe(73_500);
    expect(item(nov.breakdown.despesa, "despesas-pagas")).toBe(0);
    expect(item(nov.breakdown.despesa, "despesas-a-pagar")).toBe(33_200);
    expect(item(nov.breakdown.despesa, "faturas-restantes")).toBe(0);

    const dez = footerFor("2026-12", {
      overrides: { tipo: "despesa", status: "nao_pagos" },
      projected: false,
    });
    expect(dez.opening).toBe(38_200);
    expect(dez.summary.saidasPrevistas).toBe(6_800);
    expect(dez.footer.saldo).toBe(38_200);
    expect(dez.footer.previsto).toBe(31_400);
    expect(item(dez.breakdown.despesa, "despesas-a-pagar")).toBe(6_800);
    expect(item(dez.breakdown.despesa, "faturas-restantes")).toBe(0);
  });
});

describe("previsão de saldo da fixture", () => {
  it("congela mínimo, período negativo e recuperação por entrada real", () => {
    buildFixture();

    const data = getForecastData(user.workspaceId, user.id);
    expect(data.projection.saldoInicial).toBe(-6_800);
    expect(data.projection.pontos[0]?.saldo).toBe(-6_800);
    expect(data.projection.pontos.at(-1)?.saldo).toBe(46_626);

    expect(data.alertas).toHaveLength(1);
    expect(data.alertas[0]).toMatchObject({
      inicio: "2026-11-15",
      fim: "2026-11-15",
      menorSaldo: -6_800,
      menorData: "2026-11-15",
      semRecuperacao: false,
    });
    expect(data.alertas[0]?.recuperacao?.data).toBe("2026-11-19");
    expect(data.alertas[0]?.recuperacao?.evento.descricao).toBe(
      "Receita de 19/11",
    );

    // Sem eventos estimados nesta fixture, ligar/desligar estimativas
    // produz a mesma série.
    expect(data.projectionCerto.pontos.at(-1)?.saldo).toBe(46_626);
    expect(data.projectionCerto.pontos).toHaveLength(
      data.projection.pontos.length,
    );
  });
});
