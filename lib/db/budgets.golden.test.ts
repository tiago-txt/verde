// Congela o comportamento aprovado pelo dono; não editar para passar.
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
import { createBudgetAction } from "@/lib/actions/budgets";
import {
  getBudgetCycleDetail,
  getBudgetEventsForMonth,
  listBudgetCycleDetails,
} from "./queries/budgets";
import { listAllCategories } from "./queries/categories";
import { aplicarEventosAoResumo } from "@/lib/finance/budgets";
import type { TransactionFilters } from "@/lib/finance/filters";

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

const EMPTY_FILTERS: TransactionFilters = {
  mes: "2026-10",
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
};

let testDb: TestDatabase;
let user: TestUser;

function setCurrent(target: TestUser | null) {
  state.user = target
    ? (testDb.db.select().from(users).where(eq(users.id, target.id)).get() ??
      null)
    : null;
}

function category(nome: string) {
  const found = listAllCategories(user.workspaceId).find(
    (item) => item.nome === nome && item.tipo === "despesa",
  );
  if (!found) throw new Error(`categoria ${nome}`);
  return found.id;
}

async function createBudget(options: {
  nome: string;
  categoriaId: string;
  valorPadrao: number;
  dataInicio: string;
  sobraPolicy?: "rolar" | "liberar" | "realocar";
  sobraDestinoBudgetId?: string | null;
}) {
  setCurrent(user);
  const result = await createBudgetAction({
    nome: options.nome,
    valorPadrao: options.valorPadrao,
    diaFechamento: 1,
    antecedenciaCiclos: 0,
    origens: "todas",
    categoriaIds: [options.categoriaId],
    contaId: null,
    cartaoId: null,
    cor: "#34d399",
    icone: "Target",
    dataInicio: options.dataInicio,
    dataFim: null,
    sobraPolicy: options.sobraPolicy ?? "liberar",
    sobraDestinoBudgetId: options.sobraDestinoBudgetId ?? null,
  });
  if (!result.ok) throw new Error(result.error);
  if (!result.id) throw new Error("orçamento sem id");
  return result.id;
}

function spend(descricao: string, valor: number, data: string, categoriaId: string) {
  const now = new Date("2026-11-15T12:00:00Z");
  testDb.db
    .insert(transactions)
    .values({
      id: crypto.randomUUID(),
      workspaceId: user.workspaceId,
      tipo: "despesa",
      descricao,
      valor,
      data,
      pago: true,
      contaId: null,
      cartaoId: null,
      contaDestinoId: null,
      categoriaId,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Fixture",
    email: "fixture@verde.local",
    role: "admin",
  });
  setCurrent(user);
});

afterEach(() => {
  state.user = null;
  vi.useRealTimers();
  resetTestDatabase();
});

describe("sobra_policy: liberar, rolar e realocar", () => {
  it("liberar mantém o limite e deixa o estouro aparecer", async () => {
    const mercado = category("Mercado");
    const budgetId = await createBudget({
      nome: "Mercado",
      categoriaId: mercado,
      valorPadrao: 100_000,
      dataInicio: "2026-09",
      sobraPolicy: "liberar",
    });
    spend("Setembro", 30_000, "2026-09-05", mercado);
    spend("Outubro", 120_000, "2026-10-05", mercado);

    const outubro = getBudgetCycleDetail(user.workspaceId, budgetId, "2026-10");
    expect(outubro?.resumo).toMatchObject({
      limite: 100_000,
      gasto: 120_000,
      restante: 0,
      estouro: 20_000,
      percentual: 120,
    });
  });

  it("rolar soma a sobra do ciclo anterior ao limite do seguinte", async () => {
    const mercado = category("Mercado");
    const budgetId = await createBudget({
      nome: "Mercado",
      categoriaId: mercado,
      valorPadrao: 100_000,
      dataInicio: "2026-09",
      sobraPolicy: "rolar",
    });
    spend("Setembro", 30_000, "2026-09-05", mercado);
    spend("Outubro", 120_000, "2026-10-05", mercado);

    const setembro = getBudgetCycleDetail(
      user.workspaceId,
      budgetId,
      "2026-09",
    );
    expect(setembro?.resumo.restante).toBe(70_000);

    const outubro = getBudgetCycleDetail(user.workspaceId, budgetId, "2026-10");
    expect(outubro?.resumo).toMatchObject({
      limite: 170_000,
      gasto: 120_000,
      restante: 50_000,
      estouro: 0,
    });
  });

  it("realocar leva a sobra para o orçamento de destino no ciclo seguinte", async () => {
    const mercado = category("Mercado");
    const lazer = category("Lazer");
    const destino = await createBudget({
      nome: "Lazer",
      categoriaId: lazer,
      valorPadrao: 100_000,
      dataInicio: "2026-09",
      sobraPolicy: "liberar",
    });
    await createBudget({
      nome: "Mercado",
      categoriaId: mercado,
      valorPadrao: 100_000,
      dataInicio: "2026-09",
      sobraPolicy: "realocar",
      sobraDestinoBudgetId: destino,
    });
    spend("Setembro mercado", 30_000, "2026-09-05", mercado);

    const outubro = listBudgetCycleDetails(user.workspaceId, "2026-10").find(
      (detail) => detail.resumo.id === destino,
    );
    expect(outubro?.resumo).toMatchObject({
      limite: 170_000,
      gasto: 0,
      restante: 170_000,
      estouro: 0,
    });
  });

  it("provisão e sobra entram no previsto do mês", async () => {
    const mercado = category("Mercado");
    const budgetId = await createBudget({
      nome: "Mercado",
      categoriaId: mercado,
      valorPadrao: 100_000,
      dataInicio: "2026-09",
      sobraPolicy: "liberar",
    });
    spend("Setembro", 30_000, "2026-09-05", mercado);

    const eventos = getBudgetEventsForMonth(
      user.workspaceId,
      "2026-10",
      EMPTY_FILTERS,
    );
    const provisao = eventos.find((event) => event.tipoEvento === "provisao");
    expect(provisao).toMatchObject({
      tipoEvento: "provisao",
      data: "2026-10-01",
      valor: 100_000,
      resumo: { id: budgetId, limite: 100_000, gasto: 0, restante: 100_000 },
    });

    const sobra = eventos.find((event) => event.tipoEvento === "sobra");
    expect(sobra).toMatchObject({
      tipoEvento: "sobra",
      data: "2026-10-01",
      valor: 70_000,
      ciclo: "2026-09",
    });

    const resumo = aplicarEventosAoResumo(
      {
        entradasPagas: 0,
        saidasPagas: 0,
        entradasPrevistas: 0,
        saidasPrevistas: 0,
        saldoRealizado: 0,
        saldoPrevisto: 0,
      },
      eventos.map((event) => ({
        tipo: event.tipoEvento,
        data: event.data,
        valor: event.valor,
        ciclo: event.ciclo,
      })),
    );
    expect(resumo.saldoPrevisto).toBe(-30_000);
    expect(resumo.provisoesOrcamento).toBe(100_000);
    expect(resumo.sobrasOrcamento).toBe(70_000);
  });
});
