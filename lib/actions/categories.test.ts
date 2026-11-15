import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "@/lib/db/testing";
import {
  budgetCategories,
  budgetCycleExceptions,
  budgetVersions,
  budgets,
  categories,
  recurrences,
  transactions,
  users,
  type CategoryType,
  type User,
} from "@/lib/db/schema";
import { mergeCategoriesAction } from "@/lib/actions/categories";

const state = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth/current-user", () => ({
  requireUser: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
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

function createCategory(
  nome: string,
  tipo: CategoryType = "despesa",
  overrides: Partial<typeof categories.$inferInsert> = {},
): string {
  const id = crypto.randomUUID();
  testDb.db
    .insert(categories)
    .values({
      id,
      workspaceId: user.workspaceId,
      nome,
      tipo,
      ...overrides,
    })
    .run();
  return id;
}

function insertTransaction(
  categoriaId: string,
  overrides: Partial<typeof transactions.$inferInsert> = {},
): string {
  const id = crypto.randomUUID();
  testDb.db
    .insert(transactions)
    .values({
      id,
      workspaceId: user.workspaceId,
      tipo: "despesa",
      descricao: "Lançamento",
      valor: 1_000,
      data: "2026-11-10",
      pago: true,
      categoriaId,
      ...overrides,
    })
    .run();
  return id;
}

function insertBudget(categoriaId: string) {
  const budgetId = crypto.randomUUID();
  testDb.db
    .insert(budgets)
    .values({
      id: budgetId,
      workspaceId: user.workspaceId,
      nome: "Orçamento",
      categoriaId,
      mes: "2026-11",
      valorLimite: 100_000,
    })
    .run();
  return budgetId;
}

function insertBudgetVersion(budgetId: string, categoriaIds: string[]) {
  const id = crypto.randomUUID();
  testDb.db
    .insert(budgetVersions)
    .values({
      id,
      workspaceId: user.workspaceId,
      budgetId,
      vigenteApartir: "2026-11",
      nome: "Orçamento",
      valorPadrao: 100_000,
      diaFechamento: 1,
      antecedenciaCiclos: 0,
      diaVencimento: 1,
      cor: "#34d399",
      icone: "Target",
      categoriaIds,
    })
    .run();
  return id;
}

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Ana",
    email: "ana@verde.local",
  });
  setCurrent(user);
});

afterEach(() => {
  state.user = null;
  resetTestDatabase();
});

describe("mergeCategoriesAction", () => {
  it("move lançamentos, orçamentos, exceções e recorrências para a categoria de destino", async () => {
    const sourceId = createCategory("Mercado antigo teste");
    const targetId = createCategory("Mercado novo teste");
    const activeId = insertTransaction(sourceId);
    const archivedId = insertTransaction(sourceId, {
      deletedAt: new Date(),
    });

    const budgetId = insertBudget(sourceId);
    testDb.db
      .insert(budgetCategories)
      .values([
        { workspaceId: user.workspaceId, budgetId, categoryId: sourceId },
        { workspaceId: user.workspaceId, budgetId, categoryId: targetId },
      ])
      .run();
    const versionId = insertBudgetVersion(budgetId, [sourceId, targetId]);

    const exceptionId = crypto.randomUUID();
    testDb.db
      .insert(budgetCycleExceptions)
      .values({
        id: exceptionId,
        workspaceId: user.workspaceId,
        budgetId,
        ciclo: "2026-12",
        tipo: "ajustado",
        dados: { categoriaIds: [sourceId, targetId] },
      })
      .run();

    const recurrenceId = crypto.randomUUID();
    testDb.db
      .insert(recurrences)
      .values({
        id: recurrenceId,
        workspaceId: user.workspaceId,
        frequencia: "mensal",
        dataInicio: "2026-11-10",
        template: {
          tipo: "despesa",
          descricao: "Mercado",
          valor: 1_000,
          contaId: null,
          cartaoId: null,
          contaDestinoId: null,
          categoriaId: sourceId,
          observacao: null,
          tagIds: [],
          pago: false,
        },
      })
      .run();

    const result = await mergeCategoriesAction({ sourceId, targetId });

    expect(result).toMatchObject({ ok: true, id: targetId, count: 2 });

    const source = testDb.db
      .select()
      .from(categories)
      .where(eq(categories.id, sourceId))
      .get();
    expect(source).toBeUndefined();

    const moved = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, user.workspaceId),
          eq(transactions.categoriaId, targetId),
        ),
      )
      .all();
    expect(moved.map((row) => row.id).sort()).toEqual(
      [activeId, archivedId].sort(),
    );

    const budget = testDb.db
      .select()
      .from(budgets)
      .where(eq(budgets.id, budgetId))
      .get();
    expect(budget?.categoriaId).toBe(targetId);

    const budgetCategoryRows = testDb.db
      .select()
      .from(budgetCategories)
      .where(eq(budgetCategories.budgetId, budgetId))
      .all();
    expect(budgetCategoryRows).toHaveLength(1);
    expect(budgetCategoryRows[0]?.categoryId).toBe(targetId);

    const version = testDb.db
      .select()
      .from(budgetVersions)
      .where(eq(budgetVersions.id, versionId))
      .get();
    expect(version?.categoriaIds).toEqual([targetId]);

    const exception = testDb.db
      .select()
      .from(budgetCycleExceptions)
      .where(eq(budgetCycleExceptions.id, exceptionId))
      .get();
    expect(exception?.dados?.categoriaIds).toEqual([targetId]);

    const recurrence = testDb.db
      .select()
      .from(recurrences)
      .where(eq(recurrences.id, recurrenceId))
      .get();
    expect(recurrence?.template.categoriaId).toBe(targetId);
  });

  it("recusa tipos diferentes, categoria de sistema e categoria com subcategorias", async () => {
    const sourceId = createCategory("Mercado origem teste");
    const targetExpense = createCategory("Mercado destino teste");
    const targetIncome = createCategory("Salário destino teste", "receita");

    expect(
      await mergeCategoriesAction({
        sourceId,
        targetId: targetIncome,
      }),
    ).toMatchObject({ ok: false });

    const system = testDb.db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.workspaceId, user.workspaceId),
          eq(categories.isSystem, true),
          eq(categories.tipo, "despesa"),
        ),
      )
      .get();
    expect(system).toBeTruthy();
    expect(
      await mergeCategoriesAction({
        sourceId: system!.id,
        targetId: targetExpense,
      }),
    ).toMatchObject({ ok: false, code: "SYSTEM_CATEGORY" });

    const parentId = createCategory("Casa teste");
    createCategory("Energia teste", "despesa", { categoriaPaiId: parentId });
    expect(
      await mergeCategoriesAction({
        sourceId: parentId,
        targetId: targetExpense,
      }),
    ).toMatchObject({ ok: false, code: "HAS_CHILDREN" });

    // Nada foi excluído nos casos recusados.
    expect(
      testDb.db
        .select()
        .from(categories)
        .where(eq(categories.id, sourceId))
        .get(),
    ).toBeTruthy();
  });
});
