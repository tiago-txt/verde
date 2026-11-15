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
