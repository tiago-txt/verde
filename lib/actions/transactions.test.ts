import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, gt, isNull } from "drizzle-orm";
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
import {
  deleteTransactionAction,
  normalizeOrphanInstallmentsAction,
  updateTransactionAction,
} from "@/lib/actions/transactions";
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

describe("edição da série: destacar, converter e encerrar", () => {
  async function createFixedSeries() {
    const id = insertTransaction({ data: "2024-01-10" });
    const result = await updateTransactionAction(
      updateInput(id, { repeticao: "fixa", frequencia: "mensal" }),
    );
    expect(result.ok).toBe(true);
    const edited = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    return { id, recurrenceId: edited?.recorrenciaId as string };
  }

  async function createInstallmentSeries(total = 3) {
    const id = insertTransaction({ data: "2024-01-10", valor: 100_000 });
    const result = await updateTransactionAction(
      updateInput(id, {
        repeticao: "parcelada",
        parcelas: total,
        baseValor: "total",
        valor: 100_000,
      }),
    );
    expect(result.ok).toBe(true);
    const edited = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    return { id, groupId: edited?.parcelaGrupoId as string };
  }

  function byDate(recurrenceId: string, data: string) {
    return testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.recorrenciaId, recurrenceId),
          eq(transactions.data, data),
          isNull(transactions.deletedAt),
        ),
      )
      .get();
  }

  it("destaca só a ocorrência e mantém a série seguinte numa nova recorrência", async () => {
    const { recurrenceId } = await createFixedSeries();
    const march = byDate(recurrenceId, "2024-03-10");
    expect(march).toBeTruthy();

    const result = await updateTransactionAction(
      updateInput(march!.id, {
        data: "2024-03-10",
        descricao: "Exceção de março",
        repeticao: "nenhuma",
        scope: "single",
      }),
    );
    expect(result.ok).toBe(true);

    const detached = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, march!.id))
      .get();
    expect(detached).toMatchObject({
      descricao: "Exceção de março",
      recorrenciaId: null,
      parcelaGrupoId: null,
    });

    const original = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId))
      .get();
    expect(original?.dataFim).toBe("2024-03-09");

    const renewed = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.workspaceId, user.workspaceId))
      .all()
      .find((row) => row.id !== recurrenceId);
    expect(renewed).toMatchObject({
      dataInicio: "2024-04-10",
      frequencia: "mensal",
      ativo: true,
    });

    expect(byDate(recurrenceId, "2024-02-10")).toBeTruthy();
    expect(byDate(renewed!.id, "2024-04-10")).toBeTruthy();
  });

  it("torna avulsas esta e as próximas ocorrências e encerra a série", async () => {
    const { recurrenceId } = await createFixedSeries();
    const march = byDate(recurrenceId, "2024-03-10");

    const result = await updateTransactionAction(
      updateInput(march!.id, {
        data: "2024-03-10",
        descricao: "Avulsa de março",
        repeticao: "nenhuma",
        scope: "future",
      }),
    );
    expect(result.ok).toBe(true);

    const original = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId))
      .get();
    expect(original?.dataFim).toBe("2024-03-09");

    expect(byDate(recurrenceId, "2024-02-10")).toBeTruthy();
    expect(byDate(recurrenceId, "2024-03-10")).toBeUndefined();
    expect(byDate(recurrenceId, "2024-04-10")).toBeUndefined();

    const marchRow = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, march!.id))
      .get();
    expect(marchRow).toMatchObject({
      descricao: "Avulsa de março",
      recorrenciaId: null,
    });
  });

  it("destaca as próximas parcelas sem tocar nas anteriores", async () => {
    const { groupId } = await createInstallmentSeries();
    const first = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 1),
          isNull(transactions.deletedAt),
        ),
      )
      .get();
    const february = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 2),
          isNull(transactions.deletedAt),
        ),
      )
      .get();
    expect(february).toBeTruthy();

    const result = await updateTransactionAction(
      updateInput(february!.id, {
        data: february!.data,
        descricao: "Parcela destacada",
        repeticao: "nenhuma",
        scope: "future",
      }),
    );
    expect(result.ok).toBe(true);

    const firstAfter = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, first!.id))
      .get();
    expect(firstAfter).toMatchObject({
      parcelaGrupoId: null,
      parcelaAtual: null,
      parcelaTotal: null,
    });

    const group = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.parcelaGrupoId, groupId))
      .all();
    expect(group).toHaveLength(0);

    const detached = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, february!.id))
      .get();
    expect(detached).toMatchObject({
      descricao: "Parcela destacada",
      parcelaGrupoId: null,
      parcelaAtual: null,
      parcelaTotal: null,
    });
  });

  it("converte a série fixa em parcelas a partir da ocorrência editada", async () => {
    const { recurrenceId } = await createFixedSeries();
    const march = byDate(recurrenceId, "2024-03-10");

    const result = await updateTransactionAction(
      updateInput(march!.id, {
        data: "2024-03-10",
        repeticao: "parcelada",
        parcelas: 3,
        baseValor: "parcela",
        valor: 150_000,
        scope: "future",
      }),
    );
    expect(result.ok).toBe(true);

    const original = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId))
      .get();
    expect(original?.dataFim).toBe("2024-03-09");

    const converted = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, march!.id))
      .get();
    expect(converted).toMatchObject({
      recorrenciaId: null,
      parcelaAtual: 1,
      parcelaTotal: 3,
      valor: 150_000,
    });
    expect(converted?.parcelaGrupoId).toBeTruthy();

    const group = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === converted?.parcelaGrupoId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(group).toHaveLength(3);
    expect(group.map((row) => row.data)).toEqual([
      "2024-03-10",
      "2024-04-10",
      "2024-05-10",
    ]);
    expect(group.map((row) => row.valor)).toEqual([150_000, 150_000, 150_000]);
    expect(byDate(recurrenceId, "2024-02-10")).toBeTruthy();
  });

  it("separa uma parcela em 1/(n-1), avulsa e 1/(m)", async () => {
    const { groupId } = await createInstallmentSeries(5);
    const third = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 3),
          isNull(transactions.deletedAt),
        ),
      )
      .get();
    expect(third).toBeTruthy();

    const result = await updateTransactionAction(
      updateInput(third!.id, {
        data: third!.data,
        descricao: "Parcela avulsa",
        repeticao: "nenhuma",
        scope: "single",
        detach: "split",
      }),
    );
    expect(result.ok).toBe(true);

    const previous = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === groupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(previous.map((row) => [row.parcelaAtual, row.parcelaTotal])).toEqual([
      [1, 2],
      [2, 2],
    ]);

    const detached = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, third!.id))
      .get();
    expect(detached).toMatchObject({
      descricao: "Parcela avulsa",
      parcelaGrupoId: null,
      parcelaAtual: null,
      parcelaTotal: null,
    });

    const nextGroupId = selectedTransactions().find(
      (row) => row.parcelaGrupoId && row.parcelaGrupoId !== groupId,
    )?.parcelaGrupoId;
    const next = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === nextGroupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(next.map((row) => [row.parcelaAtual, row.parcelaTotal])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("mantém só a parcela e remove as seguintes", async () => {
    const { groupId } = await createInstallmentSeries(5);
    const fourth = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 4),
          isNull(transactions.deletedAt),
        ),
      )
      .get();

    const result = await updateTransactionAction(
      updateInput(fourth!.id, {
        data: fourth!.data,
        descricao: "Única parcela",
        repeticao: "nenhuma",
        scope: "single",
        detach: "only",
      }),
    );
    expect(result.ok).toBe(true);

    const previous = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === groupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(previous.map((row) => [row.parcelaAtual, row.parcelaTotal])).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);

    const detached = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, fourth!.id))
      .get();
    expect(detached).toMatchObject({
      descricao: "Única parcela",
      parcelaGrupoId: null,
      parcelaAtual: null,
    });

    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.parcelaGrupoId, groupId),
            eq(transactions.parcelaAtual, 5),
          ),
        )
        .get()?.deletedAt,
    ).toBeTruthy();
  });

  it("mantém só a ocorrência e remove as próximas de uma série fixa", async () => {
    const { recurrenceId } = await createFixedSeries();
    const march = byDate(recurrenceId, "2024-03-10");

    const result = await updateTransactionAction(
      updateInput(march!.id, {
        data: "2024-03-10",
        descricao: "Ocorrência única",
        repeticao: "nenhuma",
        scope: "single",
        detach: "only",
      }),
    );
    expect(result.ok).toBe(true);

    const original = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId))
      .get();
    expect(original?.dataFim).toBe("2024-03-09");

    const detached = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, march!.id))
      .get();
    expect(detached).toMatchObject({
      descricao: "Ocorrência única",
      recorrenciaId: null,
    });

    expect(byDate(recurrenceId, "2024-02-10")).toBeTruthy();
    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.recorrenciaId, recurrenceId),
            gt(transactions.data, "2024-03-10"),
          ),
        )
        .get()?.deletedAt,
    ).toBeTruthy();
  });

  it("reenumera as parcelas restantes ao excluir uma parcela", async () => {
    const { groupId } = await createInstallmentSeries(3);
    const second = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 2),
          isNull(transactions.deletedAt),
        ),
      )
      .get();

    const result = await deleteTransactionAction({
      id: second!.id,
      scope: "single",
    });
    expect(result.ok).toBe(true);

    const remaining = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === groupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(remaining.map((row) => [row.parcelaAtual, row.parcelaTotal])).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("corrige parcelamento órfão com numeração antiga", async () => {
    const { id, groupId } = await createInstallmentSeries(2);
    const second = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 2),
          isNull(transactions.deletedAt),
        ),
      )
      .get();

    // Simula o estado antigo: a 2ª foi removida sem renormalizar a 1ª.
    testDb.db
      .update(transactions)
      .set({ deletedAt: new Date() })
      .where(eq(transactions.id, second!.id))
      .run();

    const result = await normalizeOrphanInstallmentsAction();
    expect(result).toMatchObject({ ok: true, fixed: 1 });

    const first = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    expect(first).toMatchObject({
      parcelaGrupoId: null,
      parcelaAtual: null,
      parcelaTotal: null,
    });
  });

  it("volta a avulsa quando sobra só uma parcela", async () => {    const { id, groupId } = await createInstallmentSeries(2);
    const second = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 2),
          isNull(transactions.deletedAt),
        ),
      )
      .get();

    const result = await deleteTransactionAction({
      id: second!.id,
      scope: "single",
    });
    expect(result.ok).toBe(true);

    const first = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    expect(first).toMatchObject({
      parcelaGrupoId: null,
      parcelaAtual: null,
      parcelaTotal: null,
    });
  });

  it("desloca esta e as próximas parcelas ao mudar o mês", async () => {
    const { groupId } = await createInstallmentSeries(3);
    const second = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 2),
          isNull(transactions.deletedAt),
        ),
      )
      .get();

    const result = await updateTransactionAction(
      updateInput(second!.id, {
        data: "2024-04-10",
        descricao: second!.descricao,
        valor: second!.valor,
        pago: second!.pago,
        repeticao: "parcelada",
        scope: "future",
      }),
    );
    expect(result.ok).toBe(true);

    const group = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === groupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(group.map((row) => row.data)).toEqual([
      "2024-01-10",
      "2024-04-10",
      "2024-05-10",
    ]);
    expect(group.map((row) => row.valor)).toEqual([33_334, 33_333, 33_333]);
  });

  it("muda só a parcela editada quando o alcance é esta", async () => {
    const { groupId } = await createInstallmentSeries(3);
    const second = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 2),
          isNull(transactions.deletedAt),
        ),
      )
      .get();

    const result = await updateTransactionAction(
      updateInput(second!.id, {
        data: "2024-04-10",
        descricao: second!.descricao,
        valor: second!.valor,
        pago: second!.pago,
        repeticao: "parcelada",
        scope: "single",
      }),
    );
    expect(result.ok).toBe(true);

    const group = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === groupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(group.map((row) => row.data)).toEqual([
      "2024-01-10",
      "2024-04-10",
      "2024-03-10",
    ]);
  });

  it("desloca também a fatura forçada das parcelas", async () => {
    const { groupId } = await createInstallmentSeries(3);
    const group = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === groupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    const overrides = ["2024-02", "2024-03", "2024-04"];
    group.forEach((row, index) => {
      testDb.db
        .update(transactions)
        .set({ faturaChaveOverride: overrides[index] })
        .where(eq(transactions.id, row.id))
        .run();
    });

    const second = group[1];
    const result = await updateTransactionAction(
      updateInput(second!.id, {
        data: "2024-04-10",
        descricao: second!.descricao,
        valor: second!.valor,
        pago: second!.pago,
        repeticao: "parcelada",
        scope: "future",
      }),
    );
    expect(result.ok).toBe(true);

    const after = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === groupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(after.map((row) => row.faturaChaveOverride)).toEqual([
      "2024-02",
      "2024-05",
      "2024-06",
    ]);
  });

  it("antecipa as próximas parcelas quando o mês volta", async () => {
    const { groupId } = await createInstallmentSeries(3);
    const second = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 2),
          isNull(transactions.deletedAt),
        ),
      )
      .get();

    const result = await updateTransactionAction(
      updateInput(second!.id, {
        data: "2023-12-10",
        descricao: second!.descricao,
        valor: second!.valor,
        pago: second!.pago,
        repeticao: "parcelada",
        scope: "future",
      }),
    );
    expect(result.ok).toBe(true);

    const group = selectedTransactions()
      .filter((row) => row.parcelaGrupoId === groupId)
      .sort((a, b) => (a.parcelaAtual ?? 0) - (b.parcelaAtual ?? 0));
    expect(group.map((row) => row.data)).toEqual([
      "2024-01-10",
      "2023-12-10",
      "2024-01-10",
    ]);
  });

  it("mantém a data de recorrência fixa bloqueada", async () => {
    const { recurrenceId } = await createFixedSeries();
    const march = byDate(recurrenceId, "2024-03-10");

    const result = await updateTransactionAction(
      updateInput(march!.id, {
        data: "2024-04-10",
        repeticao: "fixa",
        scope: "future",
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("converte as próximas parcelas em série fixa", async () => {    const { groupId } = await createInstallmentSeries();
    const february = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          eq(transactions.parcelaAtual, 2),
          isNull(transactions.deletedAt),
        ),
      )
      .get();

    const result = await updateTransactionAction(
      updateInput(february!.id, {
        data: february!.data,
        descricao: "Série fixa",
        valor: 120_000,
        repeticao: "fixa",
        frequencia: "mensal",
        dataFim: null,
        scope: "future",
      }),
    );
    expect(result.ok).toBe(true);

    const converted = testDb.db
      .select()
      .from(transactions)
      .where(eq(transactions.id, february!.id))
      .get();
    expect(converted).toMatchObject({
      descricao: "Série fixa",
      valor: 120_000,
      parcelaGrupoId: null,
      parcelaAtual: null,
      parcelaTotal: null,
    });
    expect(converted?.recorrenciaId).toBeTruthy();

    const recurrence = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, converted!.recorrenciaId as string))
      .get();
    expect(recurrence).toMatchObject({
      frequencia: "mensal",
      dataInicio: february!.data,
      ativo: true,
    });

    const remainingGroup = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, groupId),
          isNull(transactions.deletedAt),
        ),
      )
      .all();
    expect(remainingGroup).toHaveLength(1);
    expect(remainingGroup[0]?.parcelaAtual).toBe(1);

    expect(byDate(recurrence!.id, "2024-03-10")).toBeTruthy();
    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.parcelaGrupoId, groupId),
            eq(transactions.parcelaAtual, 3),
          ),
        )
        .get()?.deletedAt,
    ).toBeTruthy();
  });
});
