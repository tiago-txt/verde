import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "./testing";
import { users, transactions, type User } from "./schema";
import { createAccountAction } from "@/lib/actions/accounts";
import { createCardAction, payInvoiceAction } from "@/lib/actions/cards";
import { createTransactionAction } from "@/lib/actions/transactions";
import { deleteTransactionAction } from "@/lib/actions/transactions";
import {
  getCardInvoiceAccountDeltas,
  listCardInvoiceEventsForMonth,
} from "./queries/cards";
import type { CardInvoiceFilters } from "@/lib/finance/cards";
import { getMonthBalances, listMonthTransactions } from "./queries/transactions";
import { faturaDaCompra } from "@/lib/finance/cards";
import { todayISO } from "@/lib/dates";

const state = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
  requireSessionUser: async () => state.user,
  requireAdmin: async () => state.user,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const FILTERS: CardInvoiceFilters = {
  tipo: null,
  cartoes: [],
  contas: [],
  categorias: [],
  tags: [],
  status: "todos",
  q: null,
};

let testDb: TestDatabase;
let user: TestUser;

function setCurrent(target: TestUser | null) {
  state.user = target
    ? (testDb.db.select().from(users).where(eq(users.id, target.id)).get() ?? null)
    : null;
}

function monthFilters() {
  return {
    mes: todayISO().slice(0, 7),
    tipo: null,
    contas: [],
    categorias: [],
    tags: [],
    status: "todos" as const,
    q: null,
    dias: 31,
    detalhe: null,
    cartoes: [],
    comprasCartao: true,
    de: null,
    ate: null,
  };
}

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Ana",
    email: "ana@verde.local",
    role: "admin",
  });
  setCurrent(user);
});

afterEach(() => {
  state.user = null;
  resetTestDatabase();
});

async function setupInvoice() {
  setCurrent(user);
  const account = await createAccountAction({
    nome: "Conta",
    tipo: "corrente",
    saldoInicial: 100_000,
    cor: "#34d399",
    icone: "Wallet",
  });
  if (!account.ok || !account.id) throw new Error("conta");

  const card = await createCardAction({
    nome: "Cartão",
    bandeira: "visa",
    limite: 500_000,
    diaFechamento: 10,
    diaVencimento: 17,
    contaPagamentoId: account.id,
    cor: "#818cf8",
    icone: "CreditCard",
  });
  if (!card.ok || !card.id) throw new Error("cartão");

  const purchase = await createTransactionAction({
    tipo: "despesa",
    descricao: "Compra no cartão",
    valor: 20_000,
    data: todayISO(),
    pago: false,
    contaId: null,
    cartaoId: card.id,
    contaDestinoId: null,
    categoriaId: null,
    tagIds: [],
    observacao: null,
    repeticao: "nenhuma",
    frequencia: "mensal",
    dataFim: null,
    parcelas: 2,
    baseValor: "total",
  });
  if (!purchase.ok || !purchase.id) throw new Error("compra");

  const faturaChave = faturaDaCompra(todayISO(), {
    diaFechamento: 10,
    diaVencimento: 17,
  });

  return {
    accountId: account.id,
    cardId: card.id,
    purchaseId: purchase.id,
    faturaChave,
  };
}

describe("fatura como evento único", () => {
  it("permanece visível após pagamento parcial e total, sem sumir", async () => {
    const fixture = await setupInvoice();

    const before = listCardInvoiceEventsForMonth(
      user.workspaceId,
      fixture.faturaChave,
      FILTERS,
    );
    expect(before).toHaveLength(1);
    expect(before[0]).toMatchObject({
      total: 20_000,
      pago: 0,
      restante: 20_000,
      status: "aberta",
    });

    const partial = await payInvoiceAction({
      cartaoId: fixture.cardId,
      faturaChave: fixture.faturaChave,
      contaId: fixture.accountId,
      valor: 5_000,
      data: todayISO(),
    });
    expect(partial.ok).toBe(true);

    const afterPartial = listCardInvoiceEventsForMonth(
      user.workspaceId,
      fixture.faturaChave,
      FILTERS,
    );
    expect(afterPartial).toHaveLength(1);
    expect(afterPartial[0]).toMatchObject({
      total: 20_000,
      pago: 5_000,
      restante: 15_000,
      status: "parcial",
    });

    const total = await payInvoiceAction({
      cartaoId: fixture.cardId,
      faturaChave: fixture.faturaChave,
      contaId: fixture.accountId,
      valor: 15_000,
      data: todayISO(),
    });
    expect(total.ok).toBe(true);

    const afterTotal = listCardInvoiceEventsForMonth(
      user.workspaceId,
      fixture.faturaChave,
      FILTERS,
    );
    expect(afterTotal).toHaveLength(1);
    expect(afterTotal[0]).toMatchObject({
      total: 20_000,
      pago: 20_000,
      restante: 0,
      status: "paga",
    });
  });

  it("oculta a transferência vinculada na lista padrão e mostra no filtro de transferência", async () => {
    const fixture = await setupInvoice();
    await payInvoiceAction({
      cartaoId: fixture.cardId,
      faturaChave: fixture.faturaChave,
      contaId: fixture.accountId,
      valor: 20_000,
      data: todayISO(),
    });

    const all = listMonthTransactions(user.workspaceId, monthFilters());
    const payments = all.filter((row) => row.vinculadaFatura);
    expect(payments).toHaveLength(1);
    expect(payments[0]?.tipo).toBe("transferencia");

    const transfers = listMonthTransactions(user.workspaceId, {
      ...monthFilters(),
      tipo: "transferencia",
    });
    expect(
      transfers.filter((row) => row.vinculadaFatura),
    ).toHaveLength(1);
  });

  it("desfazer o pagamento reabre a fatura", async () => {
    const fixture = await setupInvoice();
    const payment = await payInvoiceAction({
      cartaoId: fixture.cardId,
      faturaChave: fixture.faturaChave,
      contaId: fixture.accountId,
      valor: 20_000,
      data: todayISO(),
    });
    if (!payment.ok || !payment.id) throw new Error("pagamento");

    expect(
      listCardInvoiceEventsForMonth(
        user.workspaceId,
        fixture.faturaChave,
        FILTERS,
      )[0],
    ).toMatchObject({ status: "paga", restante: 0 });

    const undo = await deleteTransactionAction({
      id: payment.id,
      scope: "single",
    });
    expect(undo.ok).toBe(true);

    expect(
      listCardInvoiceEventsForMonth(
        user.workspaceId,
        fixture.faturaChave,
        FILTERS,
      )[0],
    ).toMatchObject({ status: "aberta", restante: 20_000 });
  });

  it("não duplica o previsto: linha usa restante e transferência usa o valor pago", async () => {
    const fixture = await setupInvoice();
    const before = getCardInvoiceAccountDeltas(user.workspaceId).get(
      fixture.accountId,
    );
    expect(before).toBe(-20_000);

    await payInvoiceAction({
      cartaoId: fixture.cardId,
      faturaChave: fixture.faturaChave,
      contaId: fixture.accountId,
      valor: 5_000,
      data: todayISO(),
    });

    // A linha virtual passa a valer 150; a transferência real já tirou 50.
    expect(
      getCardInvoiceAccountDeltas(user.workspaceId).get(fixture.accountId),
    ).toBe(-15_000);

    const balances = getMonthBalances(
      user.workspaceId,
      todayISO().slice(0, 7),
    );
    expect(balances.byDay[todayISO()]).toBe(95_000);
  });

  it("pagamento sem fatura_chave entra no FIFO e não duplica os 523", async () => {
    const fixture = await setupInvoice();
    const now = new Date();
    testDb.db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        workspaceId: user.workspaceId,
        tipo: "transferencia",
        descricao: "Pagamento Santander → Nu",
        valor: 523,
        data: todayISO(),
        pago: true,
        contaId: fixture.accountId,
        cartaoDestinoId: fixture.cardId,
        faturaChave: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const [event] = listCardInvoiceEventsForMonth(
      user.workspaceId,
      fixture.faturaChave,
      FILTERS,
    );
    expect(event).toMatchObject({
      total: 20_000,
      pago: 523,
      restante: 19_477,
    });
    expect(
      getCardInvoiceAccountDeltas(user.workspaceId).get(fixture.accountId),
    ).toBe(-19_477);
  });

  it("pagamento sem chave maior que a fatura zera o restante sem negativar", async () => {
    const fixture = await setupInvoice();
    const now = new Date();
    testDb.db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        workspaceId: user.workspaceId,
        tipo: "transferencia",
        descricao: "Pagamento a mais",
        valor: 25_000,
        data: todayISO(),
        pago: true,
        contaId: fixture.accountId,
        cartaoDestinoId: fixture.cardId,
        faturaChave: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const [event] = listCardInvoiceEventsForMonth(
      user.workspaceId,
      fixture.faturaChave,
      FILTERS,
    );
    expect(event).toMatchObject({ pago: 20_000, restante: 0, status: "paga" });
    expect(
      getCardInvoiceAccountDeltas(user.workspaceId).get(fixture.accountId) ?? 0,
    ).toBe(0);
  });

  it("pagamento em data diferente do vencimento afeta o saldo na data do pagamento", async () => {
    const fixture = await setupInvoice();
    const paymentDate = todayISO();
    await payInvoiceAction({
      cartaoId: fixture.cardId,
      faturaChave: fixture.faturaChave,
      contaId: fixture.accountId,
      valor: 20_000,
      data: paymentDate,
    });

    const balances = getMonthBalances(
      user.workspaceId,
      paymentDate.slice(0, 7),
    );
    expect(balances.byDay[paymentDate]).toBe(80_000);
    expect(paymentDate).not.toBe(
      // A fatura vence em outro mês/dia; o saldo é na data do pagamento.
      `${fixture.faturaChave}-17`,
    );
  });

  it("fatura sem valor e sem pagamento não aparece", async () => {
    setCurrent(user);
    const card = await createCardAction({
      nome: "Cartão vazio",
      bandeira: "visa",
      limite: 100_000,
      diaFechamento: 10,
      diaVencimento: 17,
      contaPagamentoId: null,
      cor: "#818cf8",
      icone: "CreditCard",
    });
    if (!card.ok) throw new Error("cartão");

    const events = listCardInvoiceEventsForMonth(
      user.workspaceId,
      faturaDaCompra(todayISO(), {
        diaFechamento: 10,
        diaVencimento: 17,
      }),
      FILTERS,
    );
    expect(events).toHaveLength(0);
  });
});
