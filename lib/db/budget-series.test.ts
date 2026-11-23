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
  closeBudgetCycleAction,
  createBudgetAction,
  deleteBudgetAction,
  reopenBudgetCycleAction,
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
import { addMonths, currentMonth, todayISO } from "@/lib/dates";

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

describe("fechamento manual do ciclo", () => {
  const filters = (mes: string) => ({
    mes,
    tipo: null,
    contas: [] as string[],
    categorias: [] as string[],
    tags: [] as string[],
    status: "todos" as const,
    q: null,
    dias: 31,
    detalhe: null,
    cartoes: [] as string[],
    comprasCartao: false,
    de: null,
    ate: null,
  });

  it("só libera a sobra depois de fechar o ciclo", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      categoriaIds: [mercado],
      dataInicio: "2026-01",
      sobraApenasAoFechar: true,
    });
    addExpense(mercado, "2026-01-10", 10_000);

    const antes = getBudgetEventsForMonth(
      user.workspaceId,
      "2026-02",
      filters("2026-02"),
    ).filter((event) => event.resumo.id === id);
    expect(antes.some((event) => event.tipoEvento === "sobra")).toBe(false);

    const fechado = await closeBudgetCycleAction({
      budgetId: id,
      ciclo: "2026-01",
    });
    expect(fechado.ok).toBe(true);

    const depois = getBudgetEventsForMonth(
      user.workspaceId,
      "2026-01",
      filters("2026-01"),
    ).filter((event) => event.resumo.id === id);
    const sobra = depois.find((event) => event.tipoEvento === "sobra");
    expect(sobra).toMatchObject({ valor: 40_000, data: "2026-01-10" });

    const reaberto = await reopenBudgetCycleAction({
      budgetId: id,
      ciclo: "2026-01",
    });
    expect(reaberto.ok).toBe(true);
    const reabertoEventos = getBudgetEventsForMonth(
      user.workspaceId,
      "2026-01",
      filters("2026-01"),
    ).filter((event) => event.resumo.id === id);
    expect(reabertoEventos.some((event) => event.tipoEvento === "sobra")).toBe(
      false,
    );
  });

  it("fecha o ciclo em andamento e usa a última compra como data da sobra", async () => {
    const mes = currentMonth();
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      categoriaIds: [mercado],
      dataInicio: mes,
      sobraApenasAoFechar: false,
    });
    addExpense(mercado, `${mes}-05`, 10_000);

    const result = await closeBudgetCycleAction({ budgetId: id, ciclo: mes });
    expect(result.ok).toBe(true);

    const eventos = getBudgetEventsForMonth(
      user.workspaceId,
      mes,
      filters(mes),
    ).filter((event) => event.resumo.id === id);
    const sobra = eventos.find((event) => event.tipoEvento === "sobra");
    expect(sobra).toMatchObject({ valor: 40_000, data: `${mes}-05` });
  });

  it("fecha ciclo futuro e agenda a sobra para o início", async () => {
    const mes = addMonths(currentMonth(), 1);
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      categoriaIds: [mercado],
      dataInicio: mes,
      diaFechamento: 10,
    });

    const result = await closeBudgetCycleAction({ budgetId: id, ciclo: mes });
    expect(result.ok).toBe(true);

    const eventos = getBudgetEventsForMonth(
      user.workspaceId,
      mes,
      filters(mes),
    ).filter((event) => event.resumo.id === id);
    const sobra = eventos.find((event) => event.tipoEvento === "sobra");
    expect(sobra).toMatchObject({ valor: 50_000, data: `${mes}-11` });
  });
});

describe("orçamento com recorrência", () => {
  const filters = (mes: string) => ({
    mes,
    tipo: null,
    contas: [] as string[],
    categorias: [] as string[],
    tags: [] as string[],
    status: "todos" as const,
    q: null,
    dias: 31,
    detalhe: null,
    cartoes: [] as string[],
    comprasCartao: false,
    de: null,
    ate: null,
  });

  it("bimestral aparece em novembro, some em dezembro e volta em janeiro", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      nome: "Bimestral",
      valorPadrao: 10_000,
      diaFechamento: 1,
      periodicidadeMeses: 2,
      categoriaIds: [mercado],
      dataInicio: "2026-11",
    });

    expect(resolved(id, "2026-11")).not.toBeNull();
    expect(resolved(id, "2026-12")).toBeNull();
    expect(resolved(id, "2027-01")).not.toBeNull();
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2026-11")?.resumo,
    ).toMatchObject({
      limite: 10_000,
      inicio: "2026-11-01",
      fim: "2026-11-30",
      fechamento: "2026-12-01",
    });
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2026-12"),
    ).toBeNull();
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-01")?.resumo.limite,
    ).toBe(10_000);
  });

  it("gasto em dezembro não consome; em janeiro consome a ocorrência de janeiro", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      nome: "Bimestral",
      valorPadrao: 50_000,
      diaFechamento: 1,
      periodicidadeMeses: 2,
      categoriaIds: [mercado],
      dataInicio: "2026-11",
    });
    addExpense(mercado, "2026-12-15", 10_000);
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2026-12"),
    ).toBeNull();

    addExpense(mercado, "2027-01-15", 10_000);
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-01")?.resumo.gasto,
    ).toBe(10_000);
  });

  it("editar todos troca a recorrência", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      nome: "Bimestral",
      valorPadrao: 50_000,
      periodicidadeMeses: 2,
      categoriaIds: [mercado],
      dataInicio: "2026-11",
    });

    const result = await updateBudget(id, "2026-11", "all", {
      valorPadrao: 60_000,
      periodicidadeMeses: 3,
      categoriaIds: [mercado],
    });
    expect(result.ok).toBe(true);

    expect(resolved(id, "2026-12")).toBeNull();
    expect(resolved(id, "2027-01")).toMatchObject({
      periodicidadeMeses: 3,
      valorPadrao: 60_000,
    });
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-01")?.resumo.limite,
    ).toBe(60_000);
  });

  it("rola a sobra por cima do mês em que o orçamento não tem ciclo", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      nome: "Bimestral",
      valorPadrao: 30_000,
      diaFechamento: 10,
      periodicidadeMeses: 2,
      sobraPolicy: "rolar",
      sobraApenasAoFechar: true,
      categoriaIds: [mercado],
      dataInicio: "2027-01",
    });

    await closeBudgetCycleAction({ budgetId: id, ciclo: "2027-01" });

    // Fevereiro é intervalo (sem ciclo próprio); a sobra precisa chegar em março.
    expect(resolved(id, "2027-02")).toBeNull();
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-03")?.resumo.limite,
    ).toBe(60_000);

    const marco = getBudgetEventsForMonth(
      user.workspaceId,
      "2027-03",
      filters("2027-03"),
    ).filter((event) => event.resumo.id === id);
    expect(marco.map((event) => [event.tipoEvento, event.valor])).toEqual([
      ["provisao", 60_000],
    ]);
  });

  it("rola a sobra por cima de um ciclo excluído do próprio orçamento", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      nome: "Mensal",
      valorPadrao: 30_000,
      diaFechamento: 10,
      sobraPolicy: "rolar",
      sobraApenasAoFechar: true,
      categoriaIds: [mercado],
      dataInicio: "2027-01",
    });

    await closeBudgetCycleAction({ budgetId: id, ciclo: "2027-01" });
    await deleteBudgetAction({ id, ciclo: "2027-02", scope: "single" });

    expect(resolved(id, "2027-02")).toBeNull();
    // A sobra do ciclo fechado atravessa o ciclo excluído.
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-03")?.resumo.limite,
    ).toBe(60_000);
  });

  it("não carrega a sobra depois do fim da vigência", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      nome: "Temporário",
      valorPadrao: 30_000,
      diaFechamento: 10,
      sobraPolicy: "rolar",
      sobraApenasAoFechar: true,
      categoriaIds: [mercado],
      dataInicio: "2027-01",
      dataFim: "2027-01",
    });

    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-01")?.resumo.limite,
    ).toBe(30_000);
    expect(getBudgetCycleDetail(user.workspaceId, id, "2027-03")).toBeNull();
  });

  it("com 'só liberar ao fechar', a rolagem espera o fechamento do ciclo", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      nome: "Mercado",
      valorPadrao: 30_000,
      diaFechamento: 10,
      sobraPolicy: "rolar",
      sobraApenasAoFechar: true,
      categoriaIds: [mercado],
      dataInicio: "2027-01",
    });
    // Sobra de 200,00 no ciclo de janeiro.
    addExpense(mercado, "2027-01-15", 10_000);

    // Ciclo aberto: nada é rolado ainda.
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-02")?.resumo.limite,
    ).toBe(30_000);
    expect(
      getBudgetEventsForMonth(user.workspaceId, "2027-01", filters("2027-01"))
        .filter((event) => event.resumo.id === id)
        .map((event) => event.tipoEvento),
    ).toEqual(["provisao"]);

    await closeBudgetCycleAction({ budgetId: id, ciclo: "2027-01" });

    // Fechado: a sobra liberada entra no ciclo seguinte.
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-02")?.resumo.limite,
    ).toBe(50_000);

    // E o mês seguinte sabe explicar de onde veio o valor.
    const fevereiro = getBudgetEventsForMonth(
      user.workspaceId,
      "2027-02",
      filters("2027-02"),
    ).filter((event) => event.resumo.id === id);
    expect(fevereiro).toHaveLength(1);
    expect(fevereiro[0]?.sobraRolada).toEqual({
      valor: 20_000,
      ciclo: "2027-01",
    });

    // Reabrir volta a reservar: a sobra sai do ciclo seguinte.
    await reopenBudgetCycleAction({ budgetId: id, ciclo: "2027-01" });
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-02")?.resumo.limite,
    ).toBe(30_000);
    expect(
      getBudgetEventsForMonth(user.workspaceId, "2027-02", filters("2027-02"))
        .filter((event) => event.resumo.id === id)
        .map((event) => event.sobraRolada ?? null),
    ).toEqual([null]);
  });

  it("sem 'só liberar ao fechar', a rolagem acontece no fechamento do ciclo", async () => {
    const mercado = categoryId("Mercado");
    const id = await createBudget({
      nome: "Mercado",
      valorPadrao: 30_000,
      diaFechamento: 10,
      sobraPolicy: "rolar",
      sobraApenasAoFechar: false,
      categoriaIds: [mercado],
      dataInicio: "2027-01",
    });
    addExpense(mercado, "2027-01-15", 10_000);

    // Sem a opção, a sobra já é liberada no fechamento do ciclo.
    expect(
      getBudgetCycleDetail(user.workspaceId, id, "2027-02")?.resumo.limite,
    ).toBe(50_000);
  });

  it("com 'só liberar ao fechar', a realocação também espera o fechamento", async () => {
    const mercado = categoryId("Mercado");
    const lazer = categoryId("Lazer");
    const destino = await createBudget({
      nome: "Lazer",
      valorPadrao: 30_000,
      diaFechamento: 10,
      categoriaIds: [lazer],
      dataInicio: "2027-01",
    });
    const origem = await createBudget({
      nome: "Mercado",
      valorPadrao: 30_000,
      diaFechamento: 10,
      sobraPolicy: "realocar",
      sobraDestinoBudgetId: destino,
      sobraApenasAoFechar: true,
      categoriaIds: [mercado],
      dataInicio: "2027-01",
    });
    addExpense(mercado, "2027-01-15", 10_000);

    const destinoFev = () =>
      listBudgetCycleDetails(user.workspaceId, "2027-02").find(
        (detail) => detail.resumo.id === destino,
      )?.resumo.limite;

    expect(destinoFev()).toBe(30_000);

    await closeBudgetCycleAction({ budgetId: origem, ciclo: "2027-01" });
    expect(destinoFev()).toBe(50_000);
  });
});

describe("orçamento manual por lançamento", () => {
  it("aceita orçamento de outra categoria e ignora os demais", async () => {
    const mercado = categoryId("Mercado");
    const lazer = categoryId("Lazer");
    const mes = currentMonth();
    const mercadoId = await createBudget({
      nome: "Mercado",
      categoriaIds: [mercado],
      dataInicio: mes,
    });
    const lazerId = await createBudget({
      nome: "Lazer",
      categoriaIds: [lazer],
      dataInicio: mes,
    });

    testDb.db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        workspaceId: user.workspaceId,
        tipo: "despesa",
        descricao: "Compra manual",
        valor: 10_000,
        data: todayISO(),
        pago: true,
        categoriaId: lazer,
        orcamentoId: mercadoId,
      })
      .run();

    expect(
      getBudgetCycleDetail(user.workspaceId, mercadoId, mes)?.resumo.gasto,
    ).toBe(10_000);
    expect(
      getBudgetCycleDetail(user.workspaceId, lazerId, mes)?.resumo.gasto,
    ).toBe(0);

    testDb.db
      .insert(transactions)
      .values({
        id: crypto.randomUUID(),
        workspaceId: user.workspaceId,
        tipo: "despesa",
        descricao: "Sem orçamento",
        valor: 5_000,
        data: todayISO(),
        pago: true,
        categoriaId: mercado,
        orcamentoIgnorado: true,
      })
      .run();

    expect(
      getBudgetCycleDetail(user.workspaceId, mercadoId, mes)?.resumo.gasto,
    ).toBe(10_000);
  });
});
