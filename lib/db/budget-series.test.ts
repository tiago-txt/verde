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
import { transactions, users, type User } from "./schema";
import {
  createBudgetAction,
  deleteBudgetAction,
  restoreBudgetCycleAction,
  updateBudgetAction,
} from "@/lib/actions/budgets";
import {
  getBudgetCycleDetail,
  getBudgetEventsForMonth,
  listBudgetCycleDetails,
  loadBudgetSeries,
} from "./queries/budgets";
import { listAllCategories } from "./queries/categories";
import { getBudgetNoticeForTransactions } from "./queries/budgets";
import { resolverCiclo } from "@/lib/finance/budgets";
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

let testDb: TestDatabase;
let user: TestUser;

function setCurrent(target: TestUser | null) {
  state.user = target
    ? (testDb.db.select().from(users).where(eq(users.id, target.id)).get() ?? null)
    : null;
}

function categoryId(nome: string): string {
  const category = listAllCategories(user.workspaceId).find(
    (item) => item.nome === nome && item.tipo === "despesa",
  );
  if (!category) throw new Error(`categoria ${nome}`);
  return category.id;
}

function budgetForm(overrides: Record<string, unknown> = {}) {
  return {
    nome: "Orçamento",
    valorPadrao: 50_000,
    diaFechamento: 1,
    antecedenciaCiclos: 0 as const,
    origens: "todas" as const,
    categoriaIds: [] as string[],
    contaId: null,
    cartaoId: null,
    cor: "#34d399",
    icone: "Target" as const,
    dataInicio: "2026-01",
    dataFim: null as string | null,
    ...overrides,
  };
}

async function createBudget(overrides: Record<string, unknown> = {}) {
  setCurrent(user);
  const result = await createBudgetAction(budgetForm(overrides));
  if (!result.ok) throw new Error(result.error);
  return result.id as string;
}

async function updateBudget(
  id: string,
  ciclo: string,
  scope: "single" | "future" | "all",
  overrides: Record<string, unknown> = {},
) {
  setCurrent(user);
  return updateBudgetAction({
    ...budgetForm({ ...overrides, dataInicio: "2026-01" }),
    id,
    ciclo,
    scope,
  });
}

function resolved(id: string, ciclo: string) {
  const series = loadBudgetSeries(user.workspaceId, {
    incluirArquivados: true,
  }).find((row) => row.id === id);
  if (!series) return null;
  return resolverCiclo(series, ciclo);
}

function addExpense(categoriaId: string, data: string, valor: number) {
  testDb.db
    .insert(transactions)
    .values({
      id: crypto.randomUUID(),
      workspaceId: user.workspaceId,
      tipo: "despesa",
      descricao: "Gasto",
      valor,
      data,
      pago: true,
      categoriaId,
    })
    .run();
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

describe("orçamento como série", () => {
  it("editar só este ciclo cria exceção sem alterar os demais", async () => {
    const mercado = categoryId("Mercado");
    const lazer = categoryId("Lazer");
    const id = await createBudget({ categoriaIds: [mercado] });

    const result = await updateBudget(id, "2026-05", "single", {
      valorPadrao: 60_000,
      categoriaIds: [lazer],
    });
    expect(result.ok).toBe(true);

    expect(resolved(id, "2026-04")).toMatchObject({
      valorPadrao: 50_000,
      categoriaIds: [mercado],
    });
    expect(resolved(id, "2026-05")).toMatchObject({
      valorPadrao: 60_000,
      categoriaIds: [lazer],
    });
    expect(resolved(id, "2026-06")).toMatchObject({
      valorPadrao: 50_000,
      categoriaIds: [mercado],
    });
  });

  it("excluir só maio mantém abril e junho; restaurar reabre maio", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({ categoriaIds: [mercado] });
    addExpense(mercado, "2026-05-10", 10_000);

    const removed = await deleteBudgetAction({
      id,
      ciclo: "2026-05",
      scope: "single",
    });
    expect(removed.ok).toBe(true);

    expect(resolved(id, "2026-04")).not.toBeNull();
    expect(resolved(id, "2026-05")).toBeNull();
    expect(resolved(id, "2026-06")).not.toBeNull();

    expect(
      listBudgetCycleDetails(user.workspaceId, "2026-05").some(
        (detail) => detail.resumo.id === id,
      ),
    ).toBe(false);
    expect(
      getBudgetEventsForMonth(user.workspaceId, "2026-05", {
        mes: "2026-05",
        tipo: null,
        contas: [],
        categorias: [],
        tags: [],
        status: "todos",
        q: null,
        dias: 31,
        detalhe: null,
        cartoes: [],
        comprasCartao: false,
        de: null,
        ate: null,
      }).some(
        (event) => event.resumo.id === id && event.ciclo === "2026-05",
      ),
    ).toBe(false);
    expect(
      getBudgetNoticeForTransactions(user.workspaceId, [
        { categoriaId: mercado, data: "2026-05-10" },
      ]),
    ).toBeNull();

    const restored = await restoreBudgetCycleAction({
      id,
      ciclo: "2026-05",
    });
    expect(restored.ok).toBe(true);
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2026-05")?.resumo.gasto,
    ).toBe(10_000);
  });

  it("editar este e os próximos preserva ciclos anteriores", async () => {
    const mercado = categoryId("Mercado");
    const lazer = categoryId("Lazer");
    const id = await createBudget({ categoriaIds: [mercado] });

    const result = await updateBudget(id, "2026-06", "future", {
      valorPadrao: 70_000,
      categoriaIds: [lazer],
    });
    expect(result.ok).toBe(true);

    expect(resolved(id, "2026-04")).toMatchObject({
      valorPadrao: 50_000,
      categoriaIds: [mercado],
    });
    expect(resolved(id, "2026-05")).toMatchObject({
      valorPadrao: 50_000,
      categoriaIds: [mercado],
    });
    expect(resolved(id, "2026-06")).toMatchObject({
      valorPadrao: 70_000,
      categoriaIds: [lazer],
    });
    expect(resolved(id, "2027-01")).toMatchObject({
      valorPadrao: 70_000,
      categoriaIds: [lazer],
    });
  });

  it("excluir este e os próximos encerra a série no ciclo anterior", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({ categoriaIds: [mercado] });

    const result = await deleteBudgetAction({
      id,
      ciclo: "2026-06",
      scope: "future",
    });
    expect(result.ok).toBe(true);

    expect(resolved(id, "2026-05")).not.toBeNull();
    expect(resolved(id, "2026-06")).toBeNull();
    expect(resolved(id, "2027-01")).toBeNull();
  });

  it("editar todos altera também os ciclos passados", async () => {
    const mercado = categoryId("Mercado");
    const lazer = categoryId("Lazer");
    const id = await createBudget({ categoriaIds: [mercado] });

    const result = await updateBudget(id, "2026-01", "all", {
      valorPadrao: 80_000,
      categoriaIds: [lazer],
    });
    expect(result.ok).toBe(true);

    expect(resolved(id, "2026-01")).toMatchObject({
      valorPadrao: 80_000,
      categoriaIds: [lazer],
    });
    expect(resolved(id, "2026-04")).toMatchObject({
      valorPadrao: 80_000,
      categoriaIds: [lazer],
    });
  });

  it("excluir todos remove a série, mas nunca lançamentos", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({ categoriaIds: [mercado] });
    addExpense(mercado, "2026-05-10", 10_000);

    const result = await deleteBudgetAction({ id, scope: "all" });
    expect(result.ok).toBe(true);
    expect(resolved(id, "2026-05")).toBeNull();
    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(eq(transactions.workspaceId, user.workspaceId))
        .all(),
    ).toHaveLength(1);
  });

  it("valida conflito de categoria por ciclo", async () => {
    const mercado = categoryId("Mercado");
    const lazer = categoryId("Lazer");
    const transporte = categoryId("Transporte");
    const a = await createBudget({ nome: "A", categoriaIds: [transporte] });
    expect(
      (await updateBudget(a, "2026-05", "single", {
        nome: "A",
        categoriaIds: [mercado],
      })).ok,
    ).toBe(true);

    const b = await createBudget({
      nome: "B",
      categoriaIds: [lazer],
      dataInicio: "2026-01",
      dataFim: "2026-06",
    });

    const conflict = await updateBudget(b, "2026-05", "single", {
      categoriaIds: [mercado],
    });
    expect(conflict.ok).toBe(false);
    expect(conflict.ok ? "" : conflict.error).toContain("2026-05");
    expect(conflict.ok ? "" : conflict.error).toContain('"A"');
  });

  it("gasto em ciclo excluído não consome orçamento nem gera aviso", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({ categoriaIds: [mercado] });
    addExpense(mercado, todayISO(), 10_000);

    const ciclo = todayISO().slice(0, 7);
    expect(
      getBudgetCycleDetail(user.workspaceId, id, ciclo)?.resumo.gasto,
    ).toBe(10_000);

    await deleteBudgetAction({ id, ciclo, scope: "single" });

    expect(getBudgetCycleDetail(user.workspaceId, id, ciclo)).toBeNull();
    expect(
      getBudgetNoticeForTransactions(user.workspaceId, [
        { categoriaId: mercado, data: todayISO() },
      ]),
    ).toBeNull();
  });
});
