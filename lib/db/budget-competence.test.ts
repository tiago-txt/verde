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
import { createCardAction, updateCardAction } from "@/lib/actions/cards";
import { createTransactionAction } from "@/lib/actions/transactions";
import {
  getBudgetCycleDetail,
  listBudgetsWithCategories,
} from "./queries/budgets";
import { listMonthTransactions } from "./queries/transactions";
import { listAllCategories } from "./queries/categories";

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
    ? (testDb.db.select().from(users).where(eq(users.id, target.id)).get() ??
      null)
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
  resetTestDatabase();
});

async function setup() {
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
    nome: "Nu",
    bandeira: "visa",
    limite: 500_000,
    diaFechamento: 15,
    diaVencimento: 10,
    fechamentoCompra: "proxima_fatura",
    contaPagamentoId: account.id,
    cor: "#818cf8",
    icone: "CreditCard",
  });
  if (!card.ok || !card.id) throw new Error("cartão");

  const mercado = listAllCategories(user.workspaceId).find(
    (category) => category.nome === "Mercado" && category.tipo === "despesa",
  );
  if (!mercado) throw new Error("categoria");

  const budget = await createBudgetAction({
    nome: "Mercado",
    valorPadrao: 100_000,
    diaFechamento: 1,
    antecedenciaCiclos: 0,
    origens: "todas",
    categoriaIds: [mercado.id],
    contaId: account.id,
    cartaoId: card.id,
    cor: "#34d399",
    icone: "Target",
    dataInicio: "2026-01",
    dataFim: null,
  });
  if (!budget.ok || !budget.id) throw new Error("orçamento");

  return { accountId: account.id, cardId: card.id, budgetId: budget.id };
}

async function purchase(options: {
  descricao: string;
  valor: number;
  data: string;
  cartaoId: string | null;
  contaId: string | null;
  categoriaId: string | null;
  orcamentoDeslocamento?: number;
}) {
  const result = await createTransactionAction({
    tipo: "despesa",
    descricao: options.descricao,
    valor: options.valor,
    data: options.data,
    pago: !options.cartaoId,
    contaId: options.contaId,
    cartaoId: options.cartaoId,
    contaDestinoId: null,
    categoriaId: options.categoriaId,
    tagIds: [],
    observacao: null,
    repeticao: "nenhuma",
    frequencia: "mensal",
    dataFim: null,
    parcelas: 2,
    baseValor: "total",
    orcamentoDeslocamento: options.orcamentoDeslocamento,
  });
  if (!result.ok) throw new Error(result.error);
}

describe("competência no consumo do orçamento", () => {
  it("compra de 12/11 no cartão consome dezembro; 15/12 usa a opção do fechamento", async () => {
    const fixture = await setup();
    const mercado = listAllCategories(user.workspaceId).find(
      (category) => category.nome === "Mercado" && category.tipo === "despesa",
    );
    if (!mercado) throw new Error("categoria");

    await purchase({
      descricao: "Mais mercado",
      valor: 523,
      data: "2026-11-12",
      cartaoId: fixture.cardId,
      contaId: null,
      categoriaId: mercado.id,
    });

    const dezembro = getBudgetCycleDetail(
      user.workspaceId,
      fixture.budgetId,
      "2026-12",
    );
    expect(dezembro?.resumo.gasto).toBe(523);
    expect(dezembro?.transactions[0]).toMatchObject({
      competenciaData: "2026-12-10",
      viaFatura: "2026-12-10",
    });

    const chip = listMonthTransactions(user.workspaceId, {
      mes: "2026-11",
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
    }).find((row) => row.descricao === "Mais mercado");
    expect(chip).toMatchObject({
      orcamentoCiclo: "2026-12",
      orcamentoViaFatura: "2026-12-10",
    });

    await purchase({
      descricao: "Compra 15/12",
      valor: 800,
      data: "2026-12-15",
      cartaoId: fixture.cardId,
      contaId: null,
      categoriaId: mercado.id,
    });

    // Padrão: compra no dia do fechamento entra na próxima fatura (fev/2027).
    expect(
      getBudgetCycleDetail(user.workspaceId, fixture.budgetId, "2027-02")
        ?.resumo.gasto,
    ).toBe(800);

    // Opção "nesta fatura" move a compra para janeiro.
    const updated = await updateCardAction({
      id: fixture.cardId,
      nome: "Nu",
      bandeira: "visa",
      limite: 500_000,
      diaFechamento: 15,
      diaVencimento: 10,
      fechamentoCompra: "fatura_atual",
      contaPagamentoId: fixture.accountId,
      cor: "#818cf8",
      icone: "CreditCard",
    });
    expect(updated.ok).toBe(true);

    expect(
      getBudgetCycleDetail(user.workspaceId, fixture.budgetId, "2027-01")
        ?.resumo.gasto,
    ).toBe(800);
    expect(
      getBudgetCycleDetail(user.workspaceId, fixture.budgetId, "2027-02")
        ?.resumo.gasto,
    ).toBe(0);
  });

  it("despesa em conta com deslocamento +1 consome o próximo ciclo", async () => {
    const fixture = await setup();
    const mercado = listAllCategories(user.workspaceId).find(
      (category) => category.nome === "Mercado" && category.tipo === "despesa",
    );
    if (!mercado) throw new Error("categoria");

    await purchase({
      descricao: "Mercado à vista",
      valor: 300,
      data: "2026-11-20",
      cartaoId: null,
      contaId: fixture.accountId,
      categoriaId: mercado.id,
      orcamentoDeslocamento: 1,
    });

    expect(
      getBudgetCycleDetail(user.workspaceId, fixture.budgetId, "2026-11")
        ?.resumo.gasto,
    ).toBe(0);
    expect(
      getBudgetCycleDetail(user.workspaceId, fixture.budgetId, "2026-12")
        ?.resumo.gasto,
    ).toBe(300);

    // Recalcula ao mudar o deslocamento para o padrão.
    const row = listMonthTransactions(user.workspaceId, {
      mes: "2026-11",
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
    }).find((item) => item.descricao === "Mercado à vista");
    expect(row).toMatchObject({
      orcamentoCiclo: "2026-12",
      orcamentoViaFatura: null,
    });

    const budgets = listBudgetsWithCategories(user.workspaceId, "2026-11");
    expect(budgets).toHaveLength(1);
  });

  it("alterar o fechamento do cartão não reescreve ciclo encerrado", async () => {
    const fixture = await setup();
    const mercado = listAllCategories(user.workspaceId).find(
      (category) => category.nome === "Mercado" && category.tipo === "despesa",
    );
    if (!mercado) throw new Error("categoria");

    await purchase({
      descricao: "Compra antiga",
      valor: 400,
      data: "2026-08-12",
      cartaoId: fixture.cardId,
      contaId: null,
      categoriaId: mercado.id,
    });

    expect(
      getBudgetCycleDetail(user.workspaceId, fixture.budgetId, "2026-09")
        ?.resumo.gasto,
    ).toBe(400);

    const updated = await updateCardAction({
      id: fixture.cardId,
      nome: "Nu",
      bandeira: "visa",
      limite: 500_000,
      diaFechamento: 10,
      diaVencimento: 10,
      fechamentoCompra: "proxima_fatura",
      contaPagamentoId: fixture.accountId,
      cor: "#818cf8",
      icone: "CreditCard",
    });
    expect(updated.ok).toBe(true);

    // O ciclo de setembro já fechou: continua com o snapshot antigo.
    expect(
      getBudgetCycleDetail(user.workspaceId, fixture.budgetId, "2026-09")
        ?.resumo.gasto,
    ).toBe(400);
    expect(
      getBudgetCycleDetail(user.workspaceId, fixture.budgetId, "2026-10")
        ?.resumo.gasto,
    ).toBe(0);
  });
});
