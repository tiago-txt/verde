import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "@/lib/db/testing";
import {
  accounts,
  categories,
  recurrences,
  transactions,
  users,
  type User,
} from "@/lib/db/schema";
import { createRecurrenceFromTransactionsAction } from "@/lib/actions/transactions";
import { updateTransactionAction } from "@/lib/actions/transactions";
import type { UpdateTransactionInput } from "@/lib/validation/transactions";

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
let accountId: string;
let categoriaId: string;

function setCurrent(target: TestUser | null) {
  state.user = target
    ? (testDb.db.select().from(users).where(eq(users.id, target.id)).get() ??
      null)
    : null;
}

function insertTransaction(
  overrides: Partial<typeof transactions.$inferInsert> = {},
): string {
  const id = crypto.randomUUID();
  testDb.db
    .insert(transactions)
    .values({
      id,
      workspaceId: user.workspaceId,
      tipo: "despesa",
      descricao: "Aluguel",
      valor: 150_000,
      data: "2024-01-10",
      pago: true,
      contaId: accountId,
      categoriaId,
      ...overrides,
    })
    .run();
  return id;
}

function selectedTransactions() {
  return testDb.db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, user.workspaceId),
        isNull(transactions.deletedAt),
      ),
    )
    .all();
}

function updateInput(
  id: string,
  overrides: Partial<UpdateTransactionInput> = {},
): UpdateTransactionInput {
  return {
    id,
    tipo: "despesa",
    descricao: "Aluguel",
    valor: 150_000,
    data: "2024-01-10",
    pago: true,
    contaId: accountId,
    cartaoId: null,
    contaDestinoId: null,
    categoriaId,
    tagIds: [],
    observacao: null,
    orcamentoDeslocamento: 0,
    repeticao: "nenhuma",
    frequencia: "mensal",
    dataFim: null,
    parcelas: 2,
    baseValor: "total",
    scope: "single",
    ...overrides,
  };
}

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Ana",
    email: "ana@verde.local",
  });
  setCurrent(user);

  accountId = crypto.randomUUID();
  testDb.db
    .insert(accounts)
    .values({
      id: accountId,
      workspaceId: user.workspaceId,
      nome: "Conta",
      tipo: "corrente",
    })
    .run();

  categoriaId =
    testDb.db
      .select({ id: categories.id })
      .from(categories)
      .where(
        and(
          eq(categories.workspaceId, user.workspaceId),
          eq(categories.tipo, "despesa"),
        ),
      )
      .get()?.id ?? "";
});

afterEach(() => {
  state.user = null;
  resetTestDatabase();
});

describe("recorrência a partir de lançamentos existentes", () => {
  it("vincula as ocorrências e usa a mais recente como modelo", async () => {
    const ids = [
      insertTransaction({ data: "2024-01-10" }),
      insertTransaction({ data: "2024-02-10", pago: false }),
      insertTransaction({ data: "2024-03-10" }),
    ];

    const result = await createRecurrenceFromTransactionsAction({
      ids,
      frequencia: "mensal",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.count).toBe(3);

    const recurrence = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, result.id as string))
      .get();
    expect(recurrence).toMatchObject({
      frequencia: "mensal",
      dataInicio: "2024-03-10",
      dataFim: null,
      ativo: true,
    });
    expect(recurrence?.template).toMatchObject({
      tipo: "despesa",
      descricao: "Aluguel",
      valor: 150_000,
      contaId: accountId,
      cartaoId: null,
      categoriaId,
      pago: false,
    });

    const linked = selectedTransactions().filter(
      (row) => row.recorrenciaId === result.id,
    );
    const linkedDates = linked.map((row) => row.data);
    expect(linkedDates).toEqual(
      expect.arrayContaining([
        "2024-01-10",
        "2024-02-10",
        "2024-03-10",
      ]),
    );

    // A geração é idempotente e cria as próximas ocorrências da série.
    expect(linkedDates.some((data) => data > "2024-03-10")).toBe(true);
  });

  it("recusa lançamentos com valores diferentes", async () => {
    const ids = [
      insertTransaction({ data: "2024-01-10" }),
      insertTransaction({ data: "2024-02-10", valor: 150_001 }),
    ];

    const result = await createRecurrenceFromTransactionsAction({
      ids,
      frequencia: "mensal",
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.error).toContain("mesmo tipo, valor");
    expect(
      testDb.db.select().from(recurrences).all(),
    ).toHaveLength(0);
  });

  it("recusa pagamento de fatura, parcela e lançamento já recorrente", async () => {
    const invoice = insertTransaction({
      data: "2024-01-10",
      faturaChave: "2024-01",
    });
    const invoiceResult = await createRecurrenceFromTransactionsAction({
      ids: [invoice],
      frequencia: "mensal",
    });
    expect(invoiceResult).toMatchObject({ ok: false });

    const installment = insertTransaction({
      data: "2024-02-10",
      parcelaGrupoId: "grupo",
      parcelaAtual: 1,
      parcelaTotal: 3,
    });
    const installmentResult = await createRecurrenceFromTransactionsAction({
      ids: [installment],
      frequencia: "mensal",
    });
    expect(installmentResult).toMatchObject({ ok: false });

    const recurrenceId = crypto.randomUUID();
    testDb.db
      .insert(recurrences)
      .values({
        id: recurrenceId,
        workspaceId: user.workspaceId,
        frequencia: "mensal",
        dataInicio: "2024-03-10",
        template: {
          tipo: "despesa",
          descricao: "Aluguel",
          valor: 150_000,
          contaId: accountId,
          cartaoId: null,
          contaDestinoId: null,
          categoriaId,
          observacao: null,
          tagIds: [],
          pago: false,
        },
      })
      .run();
    const recurring = insertTransaction({
      data: "2024-03-10",
      recorrenciaId: recurrenceId,
    });
    const recurringResult = await createRecurrenceFromTransactionsAction({
      ids: [recurring],
      frequencia: "mensal",
    });
    expect(recurringResult).toMatchObject({ ok: false });

    expect(testDb.db.select().from(recurrences).all()).toHaveLength(1);
  });

  it("recusa duas ocorrências na mesma data", async () => {
    const ids = [
      insertTransaction({ data: "2024-01-10" }),
      insertTransaction({ data: "2024-01-10" }),
    ];

    const result = await createRecurrenceFromTransactionsAction({
      ids,
      frequencia: "mensal",
    });

    expect(result).toMatchObject({ ok: false });
    if (result.ok) return;
    expect(result.error).toContain("um lançamento por data");
  });

  it("permite criar recorrência com valor zero", async () => {
    const ids = [
      insertTransaction({ data: "2024-01-10", valor: 0 }),
      insertTransaction({ data: "2024-02-10", valor: 0 }),
      insertTransaction({ data: "2024-03-10", valor: 0 }),
    ];

    const result = await createRecurrenceFromTransactionsAction({
      ids,
      frequencia: "mensal",
    });

    expect(result).toMatchObject({ ok: true });
    const recurrence = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.workspaceId, user.workspaceId))
      .get();
    expect(recurrence?.template.valor).toBe(0);
  });
});

describe("conversão de lançamento avulso em fixa/parcelada", () => {
  it("converte em fixa a partir da ocorrência editada sem tocar no passado", async () => {
    const anteriorId = insertTransaction({
      data: "2023-12-10",
      descricao: "Anterior",
    });
    const id = insertTransaction({ data: "2024-01-10" });

    const result = await updateTransactionAction(
      updateInput(id, {
        repeticao: "fixa",
        frequencia: "mensal",
        descricao: "Aluguel fixo",
        valor: 160_000,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edited = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    expect(edited).toMatchObject({
      descricao: "Aluguel fixo",
      valor: 160_000,
      data: "2024-01-10",
      pago: true,
    });
    expect(edited?.recorrenciaId).toBeTruthy();

    const recurrence = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, edited!.recorrenciaId as string))
      .get();
    expect(recurrence).toMatchObject({
      frequencia: "mensal",
      dataInicio: "2024-01-10",
      dataFim: null,
      ativo: true,
    });
    expect(recurrence?.template).toMatchObject({
      tipo: "despesa",
      descricao: "Aluguel fixo",
      valor: 160_000,
      contaId: accountId,
      categoriaId,
    });

    const linked = selectedTransactions().filter(
      (row) => row.recorrenciaId === recurrence?.id,
    );
    expect(linked.map((row) => row.data)).toEqual(
      expect.arrayContaining([
        "2024-01-10",
        "2024-02-10",
        "2024-03-10",
      ]),
    );
    expect(linked.every((row) => row.data >= "2024-01-10")).toBe(true);

    const future = linked.find((row) => row.data === "2024-02-10");
    expect(future?.pago).toBe(false);

    const anterior = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, anteriorId))
      .get();
    expect(anterior).toMatchObject({
      data: "2023-12-10",
      recorrenciaId: null,
    });
  });

  it("converte em parcelada dividindo o valor a partir da parcela editada", async () => {
    const id = insertTransaction({ data: "2024-01-10", valor: 100_000 });

    const result = await updateTransactionAction(
      updateInput(id, {
        repeticao: "parcelada",
        parcelas: 3,
        baseValor: "total",
        valor: 100_000,
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const edited = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    expect(edited).toMatchObject({
      data: "2024-01-10",
      parcelaAtual: 1,
      parcelaTotal: 3,
      valor: 33_334,
      pago: true,
    });
    expect(edited?.parcelaGrupoId).toBeTruthy();
    expect(edited?.recorrenciaId).toBeNull();

    const group = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === edited?.parcelaGrupoId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));

    expect(group).toHaveLength(3);
    expect(group.map((row) => row.parcelaAtual)).toEqual([1, 2, 3]);
    expect(group.map((row) => row.data)).toEqual([
      "2024-01-10",
      "2024-02-10",
      "2024-03-10",
    ]);
    expect(group.map((row) => row.valor)).toEqual([33_334, 33_333, 33_333]);
    expect(group.map((row) => row.pago)).toEqual([true, false, false]);
    expect(group[0]?.id).toBe(id);
    expect(testDb.db.select().from(recurrences).all()).toHaveLength(0);
  });
});
