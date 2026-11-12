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
import {
  accounts,
  categories,
  recurrences,
  transactions,
  users,
  type User,
} from "./schema";
import {
  createAccountAction,
  deleteAccountAction,
  setAccountArchivedAction,
  updateAccountAction,
} from "@/lib/actions/accounts";
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/lib/actions/categories";
import { createTagAction, deleteTagAction, renameTagAction } from "@/lib/actions/tags";
import {
  createCardAction,
  deleteCardAction,
  payInvoiceAction,
  setCardArchivedAction,
  updateCardAction,
} from "@/lib/actions/cards";
import {
  bulkAddTagAction,
  bulkChangeCategoryAction,
  bulkDeleteTransactionsAction,
  bulkSetPaidAction,
  createTransactionAction,
  deleteTransactionAction,
  duplicateTransactionAction,
  setTransactionPaidAction,
  updateTransactionAction,
} from "@/lib/actions/transactions";
import {
  createBudgetAction,
  deleteBudgetAction,
  setBudgetArchivedAction,
  setBudgetOverrideAction,
  updateBudgetAction,
} from "@/lib/actions/budgets";
import { undoLastImportAction, importJsonAction } from "@/lib/actions/data";
import { exportAllData } from "@/lib/db/queries/data-export";
import {
  listAllAccounts,
  listAccountsWithBalances,
  getAccountById,
} from "@/lib/db/queries/accounts";
import {
  getCategoryById,
  getSystemCategoryIds,
  listAllCategories,
  listTags,
} from "@/lib/db/queries/categories";
import { getCardById, listCards } from "@/lib/db/queries/cards";
import {
  listBudgetsWithCategories,
  getBudgetCycleDetail,
} from "@/lib/db/queries/budgets";
import {
  getMonthBalances,
  getTransactionDetail,
  listMonthTransactions,
} from "@/lib/db/queries/transactions";
import { getBudgetHintAction } from "@/lib/actions/budgets";
import { getReportData } from "@/lib/db/queries/reports";
import { getDashboardBalance } from "@/lib/db/queries/dashboard";
import { faturaDaCompra } from "@/lib/finance/cards";
import { currentMonth, todayISO } from "@/lib/dates";

const state = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
  requireSessionUser: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
  requireAdmin: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
  cookies: async () => ({
    get: () => undefined,
    set: () => {},
    delete: () => {},
  }),
}));

let testDb: TestDatabase;
let userA: TestUser;
let userB: TestUser;

function setCurrent(user: TestUser | null) {
  state.user = user
    ? (testDb.db.select().from(users).where(eq(users.id, user.id)).get() ?? null)
    : null;
}

function accountInput(nome: string) {
  return {
    nome,
    tipo: "corrente" as const,
    saldoInicial: 100_000,
    cor: "#34d399",
    icone: "Wallet" as const,
  };
}

function transactionInput(overrides: Record<string, unknown> = {}) {
  return {
    tipo: "despesa" as const,
    descricao: "Compra",
    valor: 5_000,
    data: todayISO(),
    pago: true,
    contaId: null,
    cartaoId: null,
    contaDestinoId: null,
    categoriaId: null,
    tagIds: [] as string[],
    observacao: null,
    repeticao: "nenhuma" as const,
    frequencia: "mensal" as const,
    dataFim: null,
    parcelas: 2,
    baseValor: "total" as const,
    ...overrides,
  };
}

function budgetInput(overrides: Record<string, unknown> = {}) {
  return {
    nome: "Orçamento A",
    valorPadrao: 50_000,
    diaFechamento: 1,
    antecedenciaCiclos: 0 as const,
    origens: "todas" as const,
    categoriaIds: [] as string[],
    contaId: null,
    cartaoId: null,
    cor: "#34d399",
    icone: "Target" as const,
    dataInicio: currentMonth(),
    dataFim: null,
    ...overrides,
  };
}

const reportFilters = (from: string, to: string) => ({
  aba: "categoria" as const,
  periodo: "mes" as const,
  tipo: "despesa" as const,
  mes: currentMonth(),
  de: from,
  ate: to,
  contas: [],
  cartoes: [],
  categorias: [],
  tags: [],
  onlyPaid: false,
  range: { from, to },
});

type Fixture = {
  accountId: string;
  cardId: string;
  categoryId: string;
  tagId: string;
  transactionId: string;
  cardTransactionId: string;
  budgetId: string;
  faturaChave: string;
};

async function createFixtureA(): Promise<Fixture> {
  setCurrent(userA);

  const account = await createAccountAction(accountInput("Conta A"));
  if (!account.ok || !account.id) throw new Error("conta A");
  const category = await createCategoryAction({
    nome: "Categoria A",
    tipo: "despesa",
    categoriaPaiId: null,
    cor: "#f97316",
    icone: "House",
  });
  if (!category.ok || !category.id) throw new Error("categoria A");
  const tag = await createTagAction({ nome: "Tag A" });
  if (!tag.ok || !tag.id) throw new Error("tag A");
  const card = await createCardAction({
    nome: "Cartão A",
    bandeira: "visa",
    limite: 500_000,
    diaFechamento: 10,
    diaVencimento: 17,
    contaPagamentoId: account.id,
    cor: "#818cf8",
    icone: "CreditCard",
  });
  if (!card.ok || !card.id) throw new Error("cartão A");

  const transaction = await createTransactionAction(
    transactionInput({
      contaId: account.id,
      categoriaId: category.id,
      tagIds: [tag.id],
    }),
  );
  if (!transaction.ok || !transaction.id) throw new Error("lançamento A");

  const cardTransaction = await createTransactionAction(
    transactionInput({
      descricao: "Compra no cartão A",
      cartaoId: card.id,
      pago: false,
    }),
  );
  if (!cardTransaction.ok || !cardTransaction.id) throw new Error("compra A");

  const budget = await createBudgetAction(
    budgetInput({
      categoriaIds: [category.id],
      contaId: account.id,
    }),
  );
  if (!budget.ok || !budget.id) throw new Error("orçamento A");

  const faturaChave = faturaDaCompra(todayISO(), {
    diaFechamento: 10,
    diaVencimento: 17,
  });

  return {
    accountId: account.id,
    cardId: card.id,
    categoryId: category.id,
    tagId: tag.id,
    transactionId: transaction.id,
    cardTransactionId: cardTransaction.id,
    budgetId: budget.id,
    faturaChave,
  };
}

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  userA = createWorkspaceUser(testDb, {
    nome: "Ana Admin",
    email: "ana@verde.local",
    role: "admin",
  });
  userB = createWorkspaceUser(testDb, {
    nome: "Bia Membro",
    email: "bia@verde.local",
    role: "membro",
  });
  setCurrent(userA);
});

afterEach(() => {
  state.user = null;
  resetTestDatabase();
});

describe("isolamento por workspace", () => {
  it("B não lista nada de A em nenhuma entidade", async () => {
    const fixture = await createFixtureA();

    setCurrent(userB);

    expect(listAllAccounts(userB.workspaceId)).toEqual([]);
    expect(listAccountsWithBalances(userB.workspaceId)).toEqual([]);
    expect(listCards(userB.workspaceId)).toEqual([]);
    expect(
      listAllCategories(userB.workspaceId).some(
        (category) => category.id === fixture.categoryId,
      ),
    ).toBe(false);
    expect(
      listTags(userB.workspaceId).some((tag) => tag.id === fixture.tagId),
    ).toBe(false);
    expect(
      listMonthTransactions(userB.workspaceId, {
        mes: currentMonth(),
        tipo: null,
        contas: [],
        categorias: [],
        tags: [],
        status: "todos",
        q: null,
        dias: 31,
        detalhe: null,
        cartoes: [],
        comprasCartao: true,
        de: null,
        ate: null,
      }),
    ).toEqual([]);
    expect(listBudgetsWithCategories(userB.workspaceId)).toEqual([]);

    const report = getReportData(
      userB.workspaceId,
      reportFilters(`${currentMonth()}-01`, `${currentMonth()}-28`),
    );
    expect(report.totals.despesas).toBe(0);
    expect(report.currentRows).toEqual([]);

    const dashboard = await getDashboardBalance(userB.workspaceId);
    expect(dashboard.operational).toBe(0);
    expect(dashboard.accounts).toEqual([]);
    expect(dashboard.cards).toEqual([]);

    const balances = getMonthBalances(userB.workspaceId, currentMonth());
    expect(balances.opening).toBe(0);
  });

  it("B não abre, edita, arquiva nem exclui registros de A", async () => {
    const fixture = await createFixtureA();
    setCurrent(userB);

    expect(
      await updateAccountAction(fixture.accountId, accountInput("Invadida")),
    ).toMatchObject({ ok: false });
    expect(await setAccountArchivedAction(fixture.accountId, true)).toMatchObject({
      ok: false,
    });
    expect(await deleteAccountAction(fixture.accountId)).toMatchObject({
      ok: false,
    });

    expect(
      await updateCategoryAction(fixture.categoryId, {
        nome: "Invadida",
        tipo: "despesa",
        categoriaPaiId: null,
        cor: "#f97316",
        icone: "House",
      }),
    ).toMatchObject({ ok: false });
    expect(
      await deleteCategoryAction({ id: fixture.categoryId }),
    ).toMatchObject({ ok: false });

    expect(
      await renameTagAction(fixture.tagId, { nome: "Invadida" }),
    ).toMatchObject({ ok: false });
    expect(await deleteTagAction(fixture.tagId)).toMatchObject({ ok: false });

    expect(
      await updateCardAction({
        id: fixture.cardId,
        nome: "Invadido",
        bandeira: "visa",
        limite: 1,
        diaFechamento: 10,
        diaVencimento: 17,
        contaPagamentoId: null,
        cor: "#818cf8",
        icone: "CreditCard",
      }),
    ).toMatchObject({ ok: false });
    expect(
      await setCardArchivedAction({ id: fixture.cardId, arquivado: true }),
    ).toMatchObject({ ok: false });
    expect(await deleteCardAction({ id: fixture.cardId })).toMatchObject({
      ok: false,
    });
    expect(
      await payInvoiceAction({
        cartaoId: fixture.cardId,
        faturaChave: fixture.faturaChave,
        contaId: fixture.accountId,
        valor: 100,
        data: todayISO(),
      }),
    ).toMatchObject({ ok: false });

    expect(
      await updateTransactionAction({
        ...transactionInput({
          contaId: fixture.accountId,
          categoriaId: fixture.categoryId,
        }),
        id: fixture.transactionId,
        scope: "single",
      }),
    ).toMatchObject({ ok: false });
    expect(
      await deleteTransactionAction({ id: fixture.transactionId }),
    ).toMatchObject({ ok: false });
    expect(
      await setTransactionPaidAction({
        id: fixture.transactionId,
        pago: false,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await duplicateTransactionAction(fixture.transactionId),
    ).toMatchObject({ ok: false });
    expect(
      await bulkSetPaidAction({
        ids: [fixture.transactionId],
        pago: false,
      }),
    ).toMatchObject({ ok: true, count: 0 });
    expect(
      await bulkChangeCategoryAction({
        ids: [fixture.transactionId],
        categoriaId: fixture.categoryId,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await bulkAddTagAction({
        ids: [fixture.transactionId],
        tagId: fixture.tagId,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await bulkDeleteTransactionsAction({ ids: [fixture.transactionId] }),
    ).toMatchObject({ ok: true, count: 0 });

    expect(
      await updateBudgetAction({
        ...budgetInput({
          categoriaIds: [fixture.categoryId],
          contaId: fixture.accountId,
        }),
        id: fixture.budgetId,
        scope: "all",
        ciclo: currentMonth(),
      }),
    ).toMatchObject({ ok: false });
    expect(
      await setBudgetOverrideAction({
        budgetId: fixture.budgetId,
        ciclo: currentMonth(),
        valorCentavos: 100,
      }),
    ).toMatchObject({ ok: false });
    expect(
      await setBudgetArchivedAction({
        id: fixture.budgetId,
        arquivado: true,
      }),
    ).toMatchObject({ ok: false });
    expect(await deleteBudgetAction({ id: fixture.budgetId })).toMatchObject({
      ok: false,
    });
    expect(await undoLastImportAction()).toMatchObject({ ok: false });

    // Nada de A mudou.
    setCurrent(userA);
    expect(getAccountById(userA.workspaceId, fixture.accountId)?.nome).toBe(
      "Conta A",
    );
    expect(
      getCategoryById(userA.workspaceId, fixture.categoryId)?.nome,
    ).toBe("Categoria A");
    expect(getCardById(userA.workspaceId, fixture.cardId)?.nome).toBe(
      "Cartão A",
    );
    expect(listBudgetsWithCategories(userA.workspaceId)).toHaveLength(1);
    expect(
      listMonthTransactions(userA.workspaceId, {
        mes: currentMonth(),
        tipo: null,
        contas: [],
        categorias: [],
        tags: [],
        status: "todos",
        q: null,
        dias: 31,
        detalhe: null,
        cartoes: [],
        comprasCartao: true,
        de: null,
        ate: null,
      }),
    ).toHaveLength(2);
  });

  it("rejeita IDs de A em vínculos criados por B", async () => {
    const fixture = await createFixtureA();
    setCurrent(userB);

    const withAccount = await createTransactionAction(
      transactionInput({ contaId: fixture.accountId }),
    );
    expect(withAccount).toMatchObject({ ok: false });

    const withCategory = await createTransactionAction(
      transactionInput({ categoriaId: fixture.categoryId }),
    );
    expect(withCategory).toMatchObject({ ok: false });

    const withTag = await createTransactionAction(
      transactionInput({ tagIds: [fixture.tagId] }),
    );
    expect(withTag).toMatchObject({ ok: false });

    const withCard = await createTransactionAction(
      transactionInput({ cartaoId: fixture.cardId }),
    );
    expect(withCard).toMatchObject({ ok: false });

    const budget = await createBudgetAction(
      budgetInput({ categoriaIds: [fixture.categoryId] }),
    );
    expect(budget).toMatchObject({ ok: false });

    // Categoria de B + conta/cartão de A também é rejeitado.
    const bCategory = await createCategoryAction({
      nome: "Categoria B para vínculo",
      tipo: "despesa",
      categoriaPaiId: null,
      cor: "#f97316",
      icone: "House",
    });
    if (!bCategory.ok || !bCategory.id) throw new Error("categoria B");
    expect(
      await createBudgetAction(
        budgetInput({
          categoriaIds: [bCategory.id],
          contaId: fixture.accountId,
        }),
      ),
    ).toMatchObject({ ok: false });
    expect(
      await createBudgetAction(
        budgetInput({
          categoriaIds: [bCategory.id],
          cartaoId: fixture.cardId,
        }),
      ),
    ).toMatchObject({ ok: false });

    // B não criou nada.
    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(eq(transactions.workspaceId, userB.workspaceId))
        .all(),
    ).toHaveLength(0);
  });

  it("dados de A não mudam quando B lança, orça e paga", async () => {
    const fixture = await createFixtureA();
    setCurrent(userA);
    const beforeBalance = getMonthBalances(userA.workspaceId, currentMonth());
    const beforeReport = getReportData(
      userA.workspaceId,
      reportFilters(`${currentMonth()}-01`, `${currentMonth()}-28`),
    );
    const beforeBudget = getBudgetCycleDetail(
      userA.workspaceId,
      fixture.budgetId,
      currentMonth(),
    );
    const beforeCard = getCardById(userA.workspaceId, fixture.cardId);

    setCurrent(userB);
    const bAccount = await createAccountAction(accountInput("Conta B"));
    if (!bAccount.ok || !bAccount.id) throw new Error("conta B");
    const bCategory = await createCategoryAction({
      nome: "Categoria B",
      tipo: "despesa",
      categoriaPaiId: null,
      cor: "#f97316",
      icone: "House",
    });
    if (!bCategory.ok || !bCategory.id) throw new Error("categoria B");
    const bTransaction = await createTransactionAction(
      transactionInput({
        contaId: bAccount.id,
        categoriaId: bCategory.id,
        valor: 999_999,
      }),
    );
    expect(bTransaction.ok).toBe(true);
    const bBudget = await createBudgetAction(
      budgetInput({ categoriaIds: [bCategory.id], contaId: bAccount.id }),
    );
    expect(bBudget.ok).toBe(true);

    setCurrent(userA);
    expect(getMonthBalances(userA.workspaceId, currentMonth())).toEqual(
      beforeBalance,
    );
    expect(
      getReportData(
        userA.workspaceId,
        reportFilters(`${currentMonth()}-01`, `${currentMonth()}-28`),
      ).totals,
    ).toEqual(beforeReport.totals);
    expect(
      getBudgetCycleDetail(userA.workspaceId, fixture.budgetId, currentMonth())
        ?.resumo.gasto,
    ).toBe(beforeBudget?.resumo.gasto);
    expect(getCardById(userA.workspaceId, fixture.cardId)).toEqual(beforeCard);
  });

  it("exportação/importação JSON remapeia IDs dentro do workspace", async () => {
    const fixture = await createFixtureA();

    setCurrent(userA);
    const backup = exportAllData(userA.workspaceId);
    expect(backup.data.accounts.length).toBe(1);
    expect(backup.data.transactions.length).toBe(2);

    setCurrent(userB);
    const result = await importJsonAction({
      json: JSON.stringify(backup),
    });
    if (!result.ok) throw new Error(result.error);

    expect(result.counts.accounts).toBe(1);
    expect(result.counts.transactions).toBe(2);
    expect(result.counts.budgets).toBe(1);

    const bAccounts = testDb.db
      .select()
      .from(accounts)
      .where(eq(accounts.workspaceId, userB.workspaceId))
      .all();
    const bTransactions = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.workspaceId, userB.workspaceId))
      .all();
    const bCategories = testDb.db
      .select()
      .from(categories)
      .where(eq(categories.workspaceId, userB.workspaceId))
      .all();

    expect(bAccounts).toHaveLength(1);
    expect(bTransactions).toHaveLength(2);
    expect(bAccounts[0]?.id).not.toBe(fixture.accountId);
    expect(
      bTransactions.every((row) => row.workspaceId === userB.workspaceId),
    ).toBe(true);
    expect(
      bTransactions.some((row) => row.contaId === fixture.accountId),
    ).toBe(false);
    expect(
      bTransactions.every(
        (row) =>
          !row.categoriaId ||
          bCategories.some((category) => category.id === row.categoriaId),
      ),
    ).toBe(true);

    // A continua intacto.
    setCurrent(userA);
    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(eq(transactions.workspaceId, userA.workspaceId))
        .all(),
    ).toHaveLength(2);
  });

  it("recorrências e parcelas de A não vazam nem são editáveis por B", async () => {
    setCurrent(userA);
    const account = await createAccountAction(accountInput("Conta grupos A"));
    if (!account.ok || !account.id) throw new Error("conta grupos A");

    const fixed = await createTransactionAction(
      transactionInput({
        contaId: account.id,
        descricao: "Recorrente A",
        repeticao: "fixa",
        frequencia: "mensal",
        dataFim: null,
      }),
    );
    expect(fixed.ok).toBe(true);

    const installments = await createTransactionAction(
      transactionInput({
        contaId: account.id,
        descricao: "Parcelada A",
        valor: 3_000,
        repeticao: "parcelada",
        parcelas: 3,
        baseValor: "total",
      }),
    );
    expect(installments.ok).toBe(true);

    const aTransactions = () =>
      testDb.db
        .select()
        .from(transactions)
        .where(eq(transactions.workspaceId, userA.workspaceId))
        .all();
    const aRecurrences = () =>
      testDb.db
        .select()
        .from(recurrences)
        .where(eq(recurrences.workspaceId, userA.workspaceId))
        .all();

    const beforeTransactions = aTransactions().length;
    const beforeRecurrences = aRecurrences().length;
    expect(beforeTransactions).toBeGreaterThanOrEqual(4);
    expect(beforeRecurrences).toBe(1);

    const installmentRow = aTransactions().find(
      (row) => row.descricao === "Parcelada A",
    );
    const fixedRow = aTransactions().find(
      (row) => row.descricao === "Recorrente A",
    );
    if (!installmentRow || !fixedRow) throw new Error("grupos A");

    setCurrent(userB);
    expect(
      await deleteTransactionAction({ id: installmentRow.id, scope: "all" }),
    ).toMatchObject({ ok: false });
    expect(
      await updateTransactionAction({
        ...transactionInput({
          contaId: account.id,
          descricao: "Invadida",
          repeticao: "parcelada",
          parcelas: 3,
          baseValor: "total",
        }),
        id: installmentRow.id,
        scope: "all",
      }),
    ).toMatchObject({ ok: false });
    expect(
      await deleteTransactionAction({ id: fixedRow.id, scope: "all" }),
    ).toMatchObject({ ok: false });
    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(eq(transactions.workspaceId, userB.workspaceId))
        .all(),
    ).toHaveLength(0);

    setCurrent(userA);
    expect(aTransactions()).toHaveLength(beforeTransactions);
    expect(aRecurrences()).toHaveLength(beforeRecurrences);
  });

  it("busca, filtros e detalhe com IDs de A não vazam para B", async () => {
    const fixture = await createFixtureA();
    setCurrent(userB);

    const filters = {
      mes: currentMonth(),
      tipo: "despesa" as const,
      contas: [fixture.accountId],
      categorias: [fixture.categoryId],
      tags: [fixture.tagId],
      cartoes: [fixture.cardId],
      status: "todos" as const,
      q: "Compra",
      dias: 31,
      detalhe: fixture.transactionId,
      comprasCartao: true,
      de: null,
      ate: null,
    };

    expect(listMonthTransactions(userB.workspaceId, filters)).toEqual([]);
    expect(
      getTransactionDetail(userB.workspaceId, fixture.transactionId),
    ).toBeNull();
    expect(
      await getBudgetHintAction({
        categoriaId: fixture.categoryId,
        data: todayISO(),
      }),
    ).toBeNull();

    // O mesmo detalhe existe para A.
    setCurrent(userA);
    expect(
      getTransactionDetail(userA.workspaceId, fixture.transactionId)?.id,
    ).toBe(fixture.transactionId);
  });

  it("cada workspace tem sua própria categoria Outros", async () => {
    const systemA = getSystemCategoryIds(userA.workspaceId);
    const systemB = getSystemCategoryIds(userB.workspaceId);

    expect(systemA.despesa).toBeTruthy();
    expect(systemB.despesa).toBeTruthy();
    expect(systemA.despesa).not.toBe(systemB.despesa);
    expect(systemA.receita).not.toBe(systemB.receita);

    setCurrent(userB);
    const account = await createAccountAction(accountInput("Conta B"));
    if (!account.ok || !account.id) throw new Error("conta B");
    const created = await createTransactionAction(
      transactionInput({ contaId: account.id, categoriaId: null }),
    );
    if (!created.ok) throw new Error(created.error);

    const row = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, created.id ?? ""))
      .get();
    expect(row?.categoriaId).toBe(systemB.despesa);
    expect(row?.categoriaId).not.toBe(systemA.despesa);
  });
});
