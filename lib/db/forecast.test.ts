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
import { users, type User } from "./schema";
import { createAccountAction } from "@/lib/actions/accounts";
import { createBudgetAction } from "@/lib/actions/budgets";
import { createCardAction, payInvoiceAction } from "@/lib/actions/cards";
import { createTransactionAction } from "@/lib/actions/transactions";
import {
  saveForecastPreferencesAction,
  simulateForecastAction,
} from "@/lib/actions/forecast";
import {
  getForecastData,
  getForecastPreferences,
  invalidateForecastCache,
} from "./queries/forecast";
import { getMonthBalances } from "./queries/transactions";
import { getBudgetEventsForDayBalances } from "./queries/budgets";
import { aplicarEventosAoSalsoDia } from "@/lib/finance/budgets";
import { listAllCategories } from "./queries/categories";
import { addDaysISO, addMonths, monthRange, todayISO } from "@/lib/dates";

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
  invalidateForecastCache();
  resetTestDatabase();
});

async function account(nome = "Conta", saldoInicial = 100_000) {
  const result = await createAccountAction({
    nome,
    tipo: "corrente",
    saldoInicial,
    cor: "#34d399",
    icone: "Wallet",
  });
  if (!result.ok || !result.id) throw new Error("conta");
  return result.id;
}

async function transaction(options: {
  tipo?: "despesa" | "receita";
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  contaId: string | null;
  cartaoId?: string | null;
  categoriaId?: string | null;
  repeticao?: "nenhuma" | "fixa";
  frequencia?: "mensal" | "semanal" | "anual";
}) {
  setCurrent(user);
  const result = await createTransactionAction({    tipo: options.tipo ?? "despesa",
    descricao: options.descricao,
    valor: options.valor,
    data: options.data,
    pago: options.pago,
    contaId: options.contaId,
    cartaoId: options.cartaoId ?? null,
    contaDestinoId: null,
    categoriaId: options.categoriaId ?? null,
    tagIds: [],
    observacao: null,
    repeticao: options.repeticao ?? "nenhuma",
    frequencia: options.frequencia ?? "mensal",
    dataFim: null,
    parcelas: 2,
    baseValor: "total",
  });
  if (!result.ok) throw new Error(result.error);
  return result.id;
}

describe("previsão: integração e isolamento", () => {
  it("calcula saldo atual até hoje e eventos futuros", async () => {
    const conta = await account();
    const hoje = todayISO();
    await transaction({
      descricao: "Paga",
      valor: 20_000,
      data: addDaysISO(hoje, -5),
      pago: true,
      contaId: conta,
    });
    await transaction({
      descricao: "Atrasada",
      valor: 10_000,
      data: addDaysISO(hoje, -2),
      pago: false,
      contaId: conta,
    });
    await transaction({
      descricao: "Receita futura",
      tipo: "receita",
      valor: 50_000,
      data: addDaysISO(hoje, 20),
      pago: false,
      contaId: conta,
    });

    const data = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
    });
    expect(data.projection.pontos[0]?.saldo).toBe(80_000);
    const futuro = data.projection.pontos.at(-1)?.saldo;
    expect(futuro).toBe(120_000);
  });

  it("recorrência virtual não duplica a ocorrência já gravada", async () => {
    const conta = await account();
    const hoje = todayISO();
    await transaction({
      descricao: "Aluguel",
      valor: 30_000,
      data: hoje,
      pago: false,
      contaId: conta,
      repeticao: "fixa",
      frequencia: "mensal",
    });

    const data = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
    });
    const ocorrencias = data.projection.eventos.filter(
      (event) => event.descricao === "Aluguel",
    );
    expect(ocorrencias).toHaveLength(7);
    expect(new Set(ocorrencias.map((event) => event.data)).size).toBe(7);
  });

  it("fatura entra pelo restante e não duplica compras do cartão", async () => {
    const conta = await account();
    const card = await createCardAction({
      nome: "Nu",
      bandeira: "visa",
      limite: 500_000,
      diaFechamento: 10,
      diaVencimento: 17,
      fechamentoCompra: "proxima_fatura",
      contaPagamentoId: conta,
      cor: "#818cf8",
      icone: "CreditCard",
    });
    if (!card.ok || !card.id) throw new Error("cartão");
    await transaction({
      descricao: "Compra cartão",
      valor: 20_000,
      data: todayISO(),
      pago: false,
      contaId: null,
      cartaoId: card.id,
    });

    let data = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
    });
    let faturas = data.projection.eventos.filter(
      (event) => event.kind === "fatura",
    );
    expect(faturas).toHaveLength(1);
    expect(faturas[0]?.valor).toBe(20_000);
    expect(
      data.projection.eventos.some((event) => event.descricao === "Compra cartão"),
    ).toBe(false);

    const faturaChave = faturas[0]?.faturaChave;
    if (!faturaChave) throw new Error("fatura");
    await payInvoiceAction({
      cartaoId: card.id,
      faturaChave,
      contaId: conta,
      valor: 5_000,
      data: todayISO(),
    });

    data = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
    });
    faturas = data.projection.eventos.filter((event) => event.kind === "fatura");
    expect(faturas[0]?.valor).toBe(15_000);
    expect(data.projection.saldoInicial).toBe(95_000);
    expect(
      data.projection.eventos.some(
        (event) => event.kind === "transacao" && event.valor === 5_000,
      ),
    ).toBe(false);
  });

  it("reserva de orçamento futuro aparece e estouro não gera reserva", async () => {
    const conta = await account();
    const mercado = listAllCategories(user.workspaceId).find(
      (category) => category.nome === "Mercado" && category.tipo === "despesa",
    );
    if (!mercado) throw new Error("categoria");
    const proximo = addMonths(todayISO().slice(0, 7), 1);

    const budget = await createBudgetAction({
      nome: "Mercado",
      valorPadrao: 50_000,
      diaFechamento: 1,
      antecedenciaCiclos: 0,
      origens: "todas",
      categoriaIds: [mercado.id],
      contaId: conta,
      cartaoId: null,
      cor: "#34d399",
      icone: "Target",
      dataInicio: proximo,
      dataFim: null,
    });
    if (!budget.ok || !budget.id) throw new Error("orçamento");

    const data = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
    });
    const reservas = data.projection.eventos.filter(
      (event) => event.kind === "reserva",
    );
    expect(reservas.some((event) => event.valor === 50_000)).toBe(true);

    await transaction({
      descricao: "Mercado estourado",
      valor: 60_000,
      data: `${proximo}-05`,
      pago: true,
      contaId: conta,
      categoriaId: mercado.id,
    });
    invalidateForecastCache();
    const after = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
    });
    expect(
      after.projection.eventos.some(
        (event) =>
          event.budgetId === budget.id &&
          event.budgetCiclo === proximo &&
          event.kind === "reserva",
      ),
    ).toBe(false);
  });

  it("série bate com o saldo do mês quando não há cartão nem orçamento", async () => {
    const conta = await account();
    const hoje = todayISO();
    await transaction({
      descricao: "Futura",
      valor: 15_000,
      data: addDaysISO(hoje, 3),
      pago: false,
      contaId: conta,
    });
    const data = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
    });
    const mes = hoje.slice(0, 7);
    const fim = monthRange(mes).end;
    const saldoMes = getMonthBalances(user.workspaceId, mes).byDay[fim];
    const saldoPrevisao =
      data.projection.pontos.find((point) => point.data === fim)?.saldo ??
      data.projection.pontos.at(-1)?.saldo;
    expect(saldoPrevisao).toBe(saldoMes);
  });

  it("série bate com o saldo do dia quando há reserva de orçamento", async () => {
    const conta = await account();
    const hoje = todayISO();
    const mes = hoje.slice(0, 7);
    const mercado = listAllCategories(user.workspaceId).find(
      (category) => category.nome === "Mercado" && category.tipo === "despesa",
    );
    if (!mercado) throw new Error("categoria");

    await createBudgetAction({
      nome: "Mercado atual",
      valorPadrao: 50_000,
      diaFechamento: 1,
      antecedenciaCiclos: 0,
      origens: "todas",
      categoriaIds: [mercado.id],
      contaId: conta,
      cartaoId: null,
      cor: "#34d399",
      icone: "Target",
      dataInicio: mes,
      dataFim: null,
    });
    await transaction({
      descricao: "Mercado atual",
      valor: 20_000,
      data: addDaysISO(hoje, 1),
      pago: true,
      contaId: conta,
      categoriaId: mercado.id,
    });

    const data = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
    });
    const fim = monthRange(mes).end;
    const saldoMes = aplicarEventosAoSalsoDia(
      getMonthBalances(user.workspaceId, mes).byDay,
      getBudgetEventsForDayBalances(user.workspaceId, mes).map((event) => ({
        tipo: event.tipoEvento,
        data: event.data,
        valor: event.valor,
        ciclo: event.ciclo,
      })),
    )[fim];
    const saldoPrevisao =
      data.projection.pontos.find((point) => point.data === fim)?.saldo ??
      data.projection.pontos.at(-1)?.saldo;
    expect(saldoPrevisao).toBe(saldoMes);
  });

  it("preferências são por usuário e conta alheia é rejeitada", async () => {
    const contaA = await account("Conta A");
    const outro = createWorkspaceUser(testDb, {
      nome: "Bia",
      email: "bia@verde.local",
    });
    setCurrent(outro);
    const contaB = await account("Conta B");
    setCurrent(user);

    const saved = await saveForecastPreferencesAction({
      horizonte: 6,
      margem: 1_000,
      contas: [contaA],
      incluirEstimativas: false,
    });
    expect(saved.ok).toBe(true);

    expect(getForecastPreferences(user.workspaceId, user.id)).toMatchObject({
      horizonte: 6,
      margem: 1_000,
      contas: [contaA],
      incluirEstimativas: false,
    });
    expect(getForecastPreferences(outro.workspaceId, outro.id).horizonte).toBe(12);

    const invalid = await saveForecastPreferencesAction({
      horizonte: 12,
      margem: 0,
      contas: [contaB],
      incluirEstimativas: true,
    });
    expect(invalid.ok).toBe(false);

    const invalidDraft = await simulateForecastAction({
      tipo: "despesa",
      descricao: "Compra",
      valor: 10_000,
      data: todayISO(),
      parcelas: 1,
      baseValor: "total",
      contaId: contaB,
      cartaoId: null,
      categoriaId: null,
    });
    expect(invalidDraft.ok).toBe(false);
  });

  it("cache não vaza entre workspaces e é invalidado por lançamento", async () => {
    const contaA = await account("Conta A");
    const outro = createWorkspaceUser(testDb, {
      nome: "Bia",
      email: "bia@verde.local",
    });
    setCurrent(outro);
    const contaB = await account("Conta B", 500_000);
    setCurrent(user);

    const a = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
      contas: [contaA],
    });
    const b = getForecastData(outro.workspaceId, outro.id, {
      horizonte: 6,
      margem: 0,
      contas: [contaB],
    });
    expect(a.projection.saldoInicial).toBe(100_000);
    expect(b.projection.saldoInicial).toBe(500_000);

    await transaction({
      descricao: "Nova",
      valor: 10_000,
      data: todayISO(),
      pago: true,
      contaId: contaA,
    });
    const after = getForecastData(user.workspaceId, user.id, {
      horizonte: 6,
      margem: 0,
      contas: [contaA],
    });
    expect(after.projection.saldoInicial).toBe(90_000);
  });

  it("Zod rejeita horizonte, margem e contas inválidas", async () => {
    const conta = await account();
    await expect(
      saveForecastPreferencesAction({
        horizonte: 9,
        margem: 0,
        contas: [conta],
        incluirEstimativas: true,
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      saveForecastPreferencesAction({
        horizonte: 12,
        margem: -1,
        contas: [conta],
        incluirEstimativas: true,
      }),
    ).resolves.toMatchObject({ ok: false });
    await expect(
      saveForecastPreferencesAction({
        horizonte: 12,
        margem: 0,
        contas: [],
        incluirEstimativas: true,
      }),
    ).resolves.toMatchObject({ ok: false });
  });

  it("simulação do modal devolve alerta e não grava", async () => {
    const conta = await account();
    const antes = getMonthBalances(user.workspaceId, todayISO().slice(0, 7));
    const result = await simulateForecastAction({
      tipo: "despesa",
      descricao: "Compra grande",
      valor: 200_000,
      data: addDaysISO(todayISO(), 5),
      parcelas: 1,
      baseValor: "total",
      contaId: conta,
      cartaoId: null,
      categoriaId: null,
      orcamentoDeslocamento: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hint.temAlerta).toBe(true);
    const depois = getMonthBalances(user.workspaceId, todayISO().slice(0, 7));
    expect(depois).toEqual(antes);
  });

  it("simulação de compra no cartão avalia o vencimento sem gravar", async () => {
    const conta = await account();
    const card = await createCardAction({
      nome: "Cartão simulado",
      bandeira: "visa",
      limite: 500_000,
      diaFechamento: 10,
      diaVencimento: 17,
      fechamentoCompra: "proxima_fatura",
      contaPagamentoId: conta,
      cor: "#818cf8",
      icone: "CreditCard",
    });
    if (!card.ok || !card.id) throw new Error("cartão");

    const countBefore = (
      testDb.sqlite.prepare("select count(*) as total from transactions").get() as {
        total: number;
      }
    ).total;
    const result = await simulateForecastAction({
      tipo: "despesa",
      descricao: "TV",
      valor: 400_000,
      data: addDaysISO(todayISO(), 5),
      parcelas: 12,
      baseValor: "total",
      contaId: null,
      cartaoId: card.id,
      categoriaId: null,
      orcamentoDeslocamento: 0,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.hint.temAlerta).toBe(true);
    expect(result.hint.periodo?.eventoInicial?.descricao).toBe("TV");
    expect(
      (
        testDb.sqlite.prepare("select count(*) as total from transactions").get() as {
          total: number;
        }
      ).total,
    ).toBe(countBefore);
  });
});
