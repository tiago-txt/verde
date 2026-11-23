import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "./testing";
import { accounts, creditCards, transactions } from "./schema";
import { getMonthBalances, listMonthTransactions } from "./queries/transactions";
import { listCardInvoiceEventsForMonth } from "./queries/cards";
import { getMonthProjection } from "./queries/forecast";
import { summarizeTransactions } from "@/lib/finance/summary";
import { aplicarFaturasAoResumo } from "@/lib/finance/cards";
import {
  buildFooterSummary,
  type FooterSummary,
} from "@/lib/finance/summary-display";
import {
  hasProjectionFilters,
  type TransactionFilters,
} from "@/lib/finance/filters";

/**
 * Regressão: "Mostrar compras no cartão" só muda a lista. A compra nunca entra
 * no resumo (a saída é a fatura), então o previsto do rodapé tem de continuar
 * vindo da projeção encadeada — antes, ligar o botão desligava a projeção e o
 * previsto passava a ser recalculado só com o mês visível, ficando errado.
 */
const TODAY = "2026-11-15";

let testDb: TestDatabase;
let user: TestUser;

beforeEach(() => {
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

const CARD_FILTERS = {
  tipo: null,
  cartoes: [] as string[],
  contas: [] as string[],
  categorias: [] as string[],
  tags: [] as string[],
  status: "todos" as const,
  q: null,
};

function insertTransaction(values: {
  tipo: "receita" | "despesa" | "transferencia";
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  contaId?: string | null;
  cartaoId?: string | null;
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
      cartaoDestinoId: null,
      faturaChave: null,
      categoriaId: null,
      orcamentoDeslocamento: 0,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

function seed() {
  const now = new Date(`${TODAY}T12:00:00Z`);
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
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const cardId = crypto.randomUUID();
  testDb.db
    .insert(creditCards)
    .values({
      id: cardId,
      workspaceId: user.workspaceId,
      nome: "Cartão A",
      bandeira: "visa",
      limite: 5_000_000,
      diaFechamento: 9,
      diaVencimento: 15,
      fechamentoCompra: "proxima_fatura",
      contaPagamentoId: accountId,
      cor: "#818cf8",
      icone: "CreditCard",
      arquivado: false,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  insertTransaction({
    tipo: "receita",
    descricao: "Salário de novembro",
    valor: 300_000,
    data: "2026-11-03",
    pago: true,
    contaId: accountId,
  });
  // Despesa de novembro ainda não paga: entra no previsto de novembro e precisa
  // continuar pesando em dezembro (o previsto acumula os meses anteriores).
  insertTransaction({
    tipo: "despesa",
    descricao: "Aluguel de novembro",
    valor: 120_000,
    data: "2026-11-10",
    pago: false,
    contaId: accountId,
  });
  // Compras no cartão (a saída real é a fatura, nunca a compra).
  insertTransaction({
    tipo: "despesa",
    descricao: "Compra de outubro",
    valor: 40_000,
    data: "2026-10-20",
    pago: false,
    cartaoId: cardId,
  });
  insertTransaction({
    tipo: "despesa",
    descricao: "Compra de novembro",
    valor: 25_000,
    data: "2026-11-05",
    pago: false,
    cartaoId: cardId,
  });
  insertTransaction({
    tipo: "despesa",
    descricao: "Compra de dezembro",
    valor: 15_000,
    data: "2026-12-04",
    pago: false,
    cartaoId: cardId,
  });

  return { accountId, cardId };
}

/** Mesma composição do rodapé de Lançamentos. */
function footerFor(
  mes: string,
  overrides: Partial<TransactionFilters> = {},
): { footer: FooterSummary; listCount: number; purchaseCount: number } {
  const activeFilters = filters(mes, overrides);
  const list = listMonthTransactions(user.workspaceId, activeFilters);
  const invoiceEvents = listCardInvoiceEventsForMonth(
    user.workspaceId,
    mes,
    CARD_FILTERS,
  );
  const summary = aplicarFaturasAoResumo(
    summarizeTransactions(list),
    invoiceEvents,
  );
  const opening = getMonthBalances(user.workspaceId, mes, "realizado").opening;
  const projectedBalance = hasProjectionFilters(activeFilters)
    ? undefined
    : getMonthProjection(user.workspaceId, mes).saldo;
  return {
    footer: buildFooterSummary(summary, opening, projectedBalance),
    listCount: list.length,
    purchaseCount: list.filter((item) => item.cartaoId).length,
  };
}

describe("rodapé de Lançamentos com compras no cartão", () => {
  it("o previsto não muda ao exibir as compras no cartão", () => {
    seed();

    for (const mes of ["2026-11", "2026-12"]) {
      const semCompras = footerFor(mes);
      const comCompras = footerFor(mes, { comprasCartao: true });

      // A lista ganha as compras do mês...
      expect(comCompras.purchaseCount).toBeGreaterThan(0);
      expect(comCompras.listCount).toBe(
        semCompras.listCount + comCompras.purchaseCount,
      );
      // ...e o previsto é o mesmo, vindo da projeção encadeada.
      expect(comCompras.footer.previsto).toBe(semCompras.footer.previsto);
      expect(comCompras.footer.previsto).toBe(
        getMonthProjection(user.workspaceId, mes).saldo,
      );
    }
  });

  it("sem a projeção, o recorte erra o previsto de dezembro", () => {
    seed();

    const comCompras = footerFor("2026-12", { comprasCartao: true });
    const projection = getMonthProjection(user.workspaceId, "2026-12").saldo;

    // Recorte de dezembro sozinho: ignora a despesa não paga de novembro e o
    // restante da fatura de novembro, que a projeção encadeada carrega.
    const recorteCompras = buildFooterSummary(
      aplicarFaturasAoResumo(
        summarizeTransactions(
          listMonthTransactions(
            user.workspaceId,
            filters("2026-12", { comprasCartao: true }),
          ),
        ),
        listCardInvoiceEventsForMonth(
          user.workspaceId,
          "2026-12",
          CARD_FILTERS,
        ),
      ),
      getMonthBalances(user.workspaceId, "2026-12", "realizado").opening,
    );

    expect(comCompras.footer.previsto).toBe(projection);
    expect(recorteCompras.previsto).not.toBe(projection);
    // O recorte fica 1.850,00 maior: 1.200,00 da despesa de novembro e
    // 650,00 da fatura de novembro que a projeção acumula.
    expect(recorteCompras.previsto - projection).toBe(185_000);
  });

  it("outros filtros continuam desligando a projeção", () => {
    seed();

    const filtrado = footerFor("2026-11", { tipo: "despesa" });
    expect(filtrado.footer.previsto).toBe(
      filtrado.footer.saldoAnterior + filtrado.footer.totalPrevisto,
    );

    const comCartao = footerFor("2026-11", { comprasCartao: true });
    expect(comCartao.footer.previsto).toBe(
      getMonthProjection(user.workspaceId, "2026-11").saldo,
    );
  });
});
