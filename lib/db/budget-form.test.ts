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
import { users, accounts, budgets, budgetCategories, transactions, type User } from "./schema";
import { createBudgetAction } from "@/lib/actions/budgets";
import {
  getBudgetAccountDeltasForMonth,
  getBudgetEventsForMonth,
  getBudgetFormData,
} from "./queries/budgets";
import { listAllCategories } from "./queries/categories";
import { addMonths, currentMonth } from "@/lib/dates";

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

let testDb: TestDatabase;
let user: TestUser;

function setCurrent(target: TestUser | null) {
  state.user = target
    ? (testDb.db.select().from(users).where(eq(users.id, target.id)).get() ?? null)
    : null;
}

function categoryIdByName(nome: string): string {
  const category = listAllCategories(user.workspaceId).find(
    (item) => item.nome === nome && item.tipo === "despesa",
  );
  if (!category) throw new Error(`categoria ${nome}`);
  return category.id;
}

async function createBudget(options: {
  nome: string;
  dataInicio: string;
  dataFim: string | null;
  categoriaIds: string[];
}) {
  setCurrent(user);
  const result = await createBudgetAction({
    nome: options.nome,
    valorPadrao: 50_000,
    diaFechamento: 1,
    antecedenciaCiclos: 0,
    origens: "todas",
    categoriaIds: options.categoriaIds,
    contaId: null,
    cartaoId: null,
    cor: "#34d399",
    icone: "Target",
    dataInicio: options.dataInicio,
    dataFim: options.dataFim,
  });
  if (!result.ok) throw new Error(result.error);
  return result.id as string;
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

describe("categorias no formulário de orçamento", () => {
  it("orçamento futuro não bloqueia a categoria no ciclo atual", async () => {
    const mercado = categoryIdByName("Mercado");
    await createBudget({
      nome: "Alimentação",
      dataInicio: addMonths(currentMonth(), 1),
      dataFim: null,
      categoriaIds: [mercado],
    });

    const currentForm = getBudgetFormData(user.workspaceId, currentMonth());
    const currentMercado = currentForm.categories.find(
      (category) => category.id === mercado,
    );
    expect(currentMercado?.blockedBy).toBeNull();
    expect(currentMercado?.blockedByBudgetId).toBeNull();

    const nextForm = getBudgetFormData(
      user.workspaceId,
      addMonths(currentMonth(), 1),
    );
    const nextMercado = nextForm.categories.find(
      (category) => category.id === mercado,
    );
    expect(nextMercado?.blockedBy).toBe("Alimentação");
  });

  it("orçamento encerrado não bloqueia o ciclo atual", async () => {
    const mercado = categoryIdByName("Mercado");
    await createBudget({
      nome: "Alimentação antiga",
      dataInicio: addMonths(currentMonth(), -2),
      dataFim: addMonths(currentMonth(), -1),
      categoriaIds: [mercado],
    });

    const form = getBudgetFormData(user.workspaceId, currentMonth());
    expect(
      form.categories.find((category) => category.id === mercado)?.blockedBy,
    ).toBeNull();
  });

  it("versões adjacentes do mesmo orçamento bloqueiam só o ciclo correto", async () => {
    const mercado = categoryIdByName("Mercado");
    const previous = addMonths(currentMonth(), -1);

    const oldId = await createBudget({
      nome: "Alimentação",
      dataInicio: previous,
      dataFim: previous,
      categoriaIds: [mercado],
    });
    const newId = await createBudget({
      nome: "Alimentação",
      dataInicio: currentMonth(),
      dataFim: null,
      categoriaIds: [mercado],
    });

    const currentForm = getBudgetFormData(user.workspaceId, currentMonth());
    expect(currentForm.activeBudgets.map((budget) => budget.budgetId)).toEqual([
      newId,
    ]);
    expect(
      currentForm.categories.find((category) => category.id === mercado)
        ?.blockedByBudgetId,
    ).toBe(newId);

    const previousForm = getBudgetFormData(user.workspaceId, previous);
    expect(previousForm.activeBudgets.map((budget) => budget.budgetId)).toEqual([
      oldId,
    ]);
  });

  it("orçamento legado sem versão ganha fallback e aparece na gestão", () => {
    const mercado = categoryIdByName("Mercado");
    const legacyId = crypto.randomUUID();

    testDb.db
      .insert(budgets)
      .values({
        id: legacyId,
        workspaceId: user.workspaceId,
        nome: "Legado",
        valorPadrao: 50_000,
        diaFechamento: 1,
        antecedenciaCiclos: 0,
        origens: "todas",
        contaId: null,
        cartaoId: null,
        dataInicio: "",
        dataFim: null,
        cor: "#34d399",
        icone: "Target",
        arquivado: false,
        categoriaId: mercado,
        mes: addMonths(currentMonth(), -1),
        valorLimite: 50_000,
      })
      .run();
    testDb.db
      .insert(budgetCategories)
      .values({
        workspaceId: user.workspaceId,
        budgetId: legacyId,
        categoryId: mercado,
      })
      .run();

    const form = getBudgetFormData(user.workspaceId, currentMonth());
    // O fallback usa `mes` como início; o orçamento fica visível e bloqueia
    // a categoria (não fica invisível bloqueando por trás).
    expect(
      form.activeBudgets.some((budget) => budget.budgetId === legacyId),
    ).toBe(true);
    expect(
      form.categories.find((category) => category.id === mercado)?.blockedBy,
    ).toBe("Legado");
  });

  it("mantém a linha de orçamento com reserva zero quando estoura", async () => {
    const mercado = categoryIdByName("Mercado");
    const accountId = crypto.randomUUID();
    testDb.db
      .insert(accounts)
      .values({
        id: accountId,
        workspaceId: user.workspaceId,
        nome: "Conta do orçamento",
        tipo: "corrente",
      })
      .run();

    setCurrent(user);
    const budget = await createBudgetAction({
      nome: "Alimentação",
      valorPadrao: 50_000,
      diaFechamento: 1,
      antecedenciaCiclos: 0,
      origens: "todas",
      categoriaIds: [mercado],
      contaId: accountId,
      cartaoId: null,
      cor: "#34d399",
      icone: "Target",
      dataInicio: currentMonth(),
      dataFim: null,
    });
    if (!budget.ok) throw new Error(budget.error);

    const first = `${currentMonth()}-05`;
    const second = `${currentMonth()}-15`;
    for (const [data, valor] of [
      [first, 30_000],
      [second, 30_000],
    ] as const) {
      testDb.db
        .insert(transactions)
        .values({
          id: crypto.randomUUID(),
          workspaceId: user.workspaceId,
          tipo: "despesa",
          descricao: "Compra",
          valor,
          data,
          pago: true,
          contaId: accountId,
          categoriaId: mercado,
        })
        .run();
    }

    const events = getBudgetEventsForMonth(user.workspaceId, currentMonth(), {
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
    });

    const line = events.find(
      (event) =>
        event.tipoEvento === "provisao" &&
        event.resumo.nome === "Alimentação",
    );
    expect(line).toBeTruthy();
    expect(line?.valor).toBe(0);
    expect(line?.resumo.estouro).toBe(10_000);
    expect(line?.resumo.restante).toBe(0);
    expect(
      events.some(
        (event) =>
          event.tipoEvento === "sobra" &&
          event.resumo.nome === "Alimentação",
      ),
    ).toBe(false);

    // A linha não altera o saldo previsto: a reserva é zero.
    expect(
      getBudgetAccountDeltasForMonth(user.workspaceId, currentMonth()).size,
    ).toBe(0);
  });

  it("funde a sobra do ciclo anterior na provisão do ciclo seguinte", async () => {
    const mercado = categoryIdByName("Mercado");
    const accountId = crypto.randomUUID();
    testDb.db
      .insert(accounts)
      .values({
        id: accountId,
        workspaceId: user.workspaceId,
        nome: "Conta da sobra",
        tipo: "corrente",
      })
      .run();

    setCurrent(user);
    const previous = addMonths(currentMonth(), -1);
    const budget = await createBudgetAction({
      nome: "Alimentação",
      valorPadrao: 50_000,
      diaFechamento: 1,
      antecedenciaCiclos: 0,
      origens: "todas",
      categoriaIds: [mercado],
      contaId: accountId,
      cartaoId: null,
      cor: "#34d399",
      icone: "Target",
      dataInicio: previous,
      dataFim: null,
    });
    if (!budget.ok) throw new Error(budget.error);

    testDb.db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        workspaceId: user.workspaceId,
        tipo: "despesa",
        descricao: "Compra do ciclo anterior",
        valor: 20_000,
        data: `${previous}-10`,
        pago: true,
        contaId: accountId,
        categoriaId: mercado,
      })
      .run();

    const filters = {
      mes: currentMonth(),
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
    const raw = getBudgetEventsForMonth(
      user.workspaceId,
      currentMonth(),
      filters,
    );
    const merged = getBudgetEventsForMonth(
      user.workspaceId,
      currentMonth(),
      filters,
      { mergeSobras: true },
    );

    expect(
      raw.some(
        (event) =>
          event.tipoEvento === "sobra" &&
          event.resumo.nome === "Alimentação",
      ),
    ).toBe(true);

    const provision = merged.find(
      (event) =>
        event.tipoEvento === "provisao" &&
        event.resumo.nome === "Alimentação",
    );
    expect(provision?.sobraAnterior).toEqual({
      valor: 30_000,
      ciclo: previous,
      rolada: false,
    });
    expect(
      merged.some(
        (event) =>
          event.tipoEvento === "sobra" &&
          event.resumo.nome === "Alimentação",
      ),
    ).toBe(false);
  });

  it("rola a sobra para o limite do ciclo seguinte", async () => {
    const mercado = categoryIdByName("Mercado");
    const accountId = crypto.randomUUID();
    testDb.db
      .insert(accounts)
      .values({
        id: accountId,
        workspaceId: user.workspaceId,
        nome: "Conta da rolagem",
        tipo: "corrente",
      })
      .run();

    setCurrent(user);
    const previous = addMonths(currentMonth(), -1);
    const budget = await createBudgetAction({
      nome: "Alimentação",
      valorPadrao: 50_000,
      diaFechamento: 1,
      antecedenciaCiclos: 0,
      origens: "todas",
      sobraPolicy: "rolar",
      categoriaIds: [mercado],
      contaId: accountId,
      cartaoId: null,
      cor: "#34d399",
      icone: "Target",
      dataInicio: previous,
      dataFim: null,
    });
    if (!budget.ok) throw new Error(budget.error);

    testDb.db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        workspaceId: user.workspaceId,
        tipo: "despesa",
        descricao: "Compra do ciclo anterior",
        valor: 20_000,
        data: `${previous}-10`,
        pago: true,
        contaId: accountId,
        categoriaId: mercado,
      })
      .run();

    const filters = {
      mes: currentMonth(),
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
    const merged = getBudgetEventsForMonth(
      user.workspaceId,
      currentMonth(),
      filters,
      { mergeSobras: true },
    );

    const provision = merged.find(
      (event) =>
        event.tipoEvento === "provisao" &&
        event.resumo.nome === "Alimentação",
    );
    expect(provision?.resumo.limite).toBe(80_000);
    expect(provision?.valor).toBe(80_000);
    expect(provision?.resumo.restante).toBe(80_000);
    expect(provision?.sobraAnterior).toEqual({
      valor: 30_000,
      ciclo: previous,
      rolada: true,
    });
    expect(
      merged.some(
        (event) =>
          event.tipoEvento === "sobra" &&
          event.resumo.nome === "Alimentação",
      ),
    ).toBe(false);
  });

  it("o próprio orçamento não bloqueia suas categorias", async () => {    const mercado = categoryIdByName("Mercado");
    const budgetId = await createBudget({
      nome: "Alimentação",
      dataInicio: currentMonth(),
      dataFim: null,
      categoriaIds: [mercado],
    });

    const form = getBudgetFormData(user.workspaceId, currentMonth());
    const blocked = form.categories.find((category) => category.id === mercado);
    expect(blocked?.blockedBy).toBe("Alimentação");
    expect(blocked?.blockedByBudgetId).toBe(budgetId);
  });
});
