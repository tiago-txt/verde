"use server";

import { and, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { scopedDb } from "@/lib/db/scoped";
import {
  budgetCategories,
  budgetCycleExceptions,
  budgetVersions,
  budgets,
  categories,
  recurrences,
  transactions,
} from "@/lib/db/schema";
import {
  countChildrenForCategory,
  countTransactionsForCategory,
  getCategoryById,
} from "@/lib/db/queries/categories";
import { invalidateForecastCache } from "@/lib/db/queries/forecast";
import {
  categoryInputSchema,
  type CategoryInput,
} from "@/lib/validation/categories";
import { idSchema } from "@/lib/validation/common";
import type { ActionResult } from "./result";

function revalidateCategories() {
  invalidateForecastCache();
  revalidatePath("/");
  revalidatePath("/lancamentos");
  revalidatePath("/limite-de-gastos");
  revalidatePath("/relatorios");
  revalidatePath("/previsao");
  revalidatePath("/contas");
  revalidatePath("/cartoes", "layout");
  revalidatePath("/configuracoes");
  revalidatePath("/configuracoes/categorias");
}

function validateParent(
  workspaceId: string,
  parentId: string | null,
  tipo: CategoryInput["tipo"],
  categoryId?: string,
): string | null {
  if (!parentId) return null;

  const { db, ws } = scopedDb(workspaceId);
  const parent = db
    .select()
    .from(categories)
    .where(
      and(eq(categories.id, parentId), ws(categories.workspaceId)),
    )
    .get();

  if (!parent) return "Categoria pai não encontrada.";
  if (parent.deletedAt) return "A categoria pai está arquivada.";
  if (parent.tipo !== tipo) return "A categoria pai deve ser do mesmo tipo.";
  if (parent.categoriaPaiId) return "Só é permitido um nível de subcategoria.";
  if (categoryId && parent.id === categoryId) {
    return "Uma categoria não pode ser pai de si mesma.";
  }

  return null;
}

export async function createCategoryAction(
  input: CategoryInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db } = scopedDb(user.workspaceId);

  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const parentError = validateParent(
    user.workspaceId,
    parsed.data.categoriaPaiId,
    parsed.data.tipo,
  );
  if (parentError) return { ok: false, error: parentError };

  const id = crypto.randomUUID();
  try {
    db.insert(categories)
      .values({ id, workspaceId: user.workspaceId, ...parsed.data })
      .run();
  } catch (error) {
    console.error("[verde] erro ao criar categoria:", error);
    return {
      ok: false,
      error: "Já existe uma categoria com esse nome neste tipo.",
    };
  }

  revalidateCategories();
  return { ok: true, id };
}

export async function updateCategoryAction(
  id: string,
  input: CategoryInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsedId = idSchema.safeParse(id);
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) {
    return {
      ok: false,
      error:
        parsed.success === false
          ? parsed.error.issues[0]?.message ?? "Dados inválidos."
          : "Categoria inválida.",
    };
  }

  const existing = getCategoryById(user.workspaceId, parsedId.data);
  if (!existing) return { ok: false, error: "Categoria não encontrada." };

  if (existing.tipo !== parsed.data.tipo) {
    return { ok: false, error: "O tipo da categoria não pode ser alterado." };
  }

  if (
    existing.isSystem &&
    parsed.data.categoriaPaiId !== existing.categoriaPaiId
  ) {
    return {
      ok: false,
      error: "Uma categoria de sistema não pode ser movida para outra categoria.",
    };
  }

  const childCount = countChildrenForCategory(user.workspaceId, parsedId.data);
  if (childCount > 0 && parsed.data.categoriaPaiId) {
    return {
      ok: false,
      error:
        "Esta categoria possui subcategorias e não pode virar subcategoria.",
    };
  }

  const parentError = validateParent(
    user.workspaceId,
    parsed.data.categoriaPaiId,
    parsed.data.tipo,
    parsedId.data,
  );
  if (parentError) return { ok: false, error: parentError };

  try {
    db.update(categories)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(categories.id, parsedId.data), ws(categories.workspaceId)))
      .run();
  } catch (error) {
    console.error("[verde] erro ao atualizar categoria:", error);
    return {
      ok: false,
      error: "Já existe uma categoria com esse nome neste tipo.",
    };
  }

  revalidateCategories();
  return { ok: true, id: parsedId.data };
}

export async function setCategoryArchivedAction(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = z
    .object({ id: idSchema, archived: z.boolean() })
    .safeParse({ id, archived });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const existing = getCategoryById(user.workspaceId, parsed.data.id);
  if (!existing) return { ok: false, error: "Categoria não encontrada." };

  if (existing.isSystem && parsed.data.archived) {
    return {
      ok: false,
      code: "SYSTEM_CATEGORY",
      error: "Categoria de sistema não pode ser arquivada.",
    };
  }

  db.update(categories)
    .set({
      deletedAt: parsed.data.archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      and(
        ws(categories.workspaceId),
        or(
          eq(categories.id, parsed.data.id),
          eq(categories.categoriaPaiId, parsed.data.id),
        ),
      ),
    )
    .run();

  revalidateCategories();
  return { ok: true, id: parsed.data.id };
}

export async function deleteCategoryAction(input: {
  id: string;
  moveToId?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = z
    .object({
      id: idSchema,
      moveToId: idSchema.nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Categoria inválida." };

  const { id, moveToId } = parsed.data;

  const existing = db
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), ws(categories.workspaceId)))
    .get();
  if (!existing) return { ok: false, error: "Categoria não encontrada." };

  if (existing.isSystem) {
    return {
      ok: false,
      code: "SYSTEM_CATEGORY",
      error: "Categoria de sistema não pode ser excluída.",
    };
  }

  const childCount = countChildrenForCategory(user.workspaceId, id);
  if (childCount > 0) {
    return {
      ok: false,
      code: "HAS_CHILDREN",
      error:
        "Esta categoria possui subcategorias. Exclua ou mova as subcategorias primeiro.",
    };
  }

  const transactionCount = countTransactionsForCategory(user.workspaceId, id);
  if (transactionCount > 0 && !moveToId) {
    return {
      ok: false,
      code: "HAS_TRANSACTIONS",
      error: `Esta categoria possui ${transactionCount} lançamento(s). Escolha outra categoria para mover os lançamentos ou arquive esta categoria.`,
    };
  }

  if (moveToId) {
    const target = db
      .select()
      .from(categories)
      .where(
        and(
          eq(categories.id, moveToId),
          ws(categories.workspaceId),
          isNull(categories.deletedAt),
        ),
      )
      .get();

    if (!target) {
      return { ok: false, error: "Categoria de destino não encontrada." };
    }
    if (target.id === id) {
      return { ok: false, error: "Escolha uma categoria de destino diferente." };
    }
    if (target.tipo !== existing.tipo) {
      return {
        ok: false,
        error: "A categoria de destino deve ser do mesmo tipo.",
      };
    }
    if (target.categoriaPaiId === id) {
      return {
        ok: false,
        error: "Não é possível mover lançamentos para uma subcategoria da categoria excluída.",
      };
    }
  }

  db.transaction((tx) => {
    if (moveToId) {
      tx.update(transactions)
        .set({ categoriaId: moveToId, updatedAt: new Date() })
        .where(
          and(
            eq(transactions.categoriaId, id),
            eq(transactions.workspaceId, user.workspaceId),
          ),
        )
        .run();
    }
    tx.delete(categories)
      .where(
        and(eq(categories.id, id), eq(categories.workspaceId, user.workspaceId)),
      )
      .run();
  });

  revalidateCategories();
  return { ok: true };
}

/**
 * Funde uma categoria de origem em outra de destino.
 *
 * Move lançamentos (inclusive arquivados), orçamentos e modelos de recorrência.
 * Em orçamentos que já cobrem as duas categorias, remove a duplicidade. A
 * categoria de origem é excluída ao final; o histórico anterior é preservado.
 */
export async function mergeCategoriesAction(input: {
  sourceId: string;
  targetId: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);
  const workspaceId = user.workspaceId;

  const parsed = z
    .object({ sourceId: idSchema, targetId: idSchema })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Categorias inválidas." };
  }

  const { sourceId, targetId } = parsed.data;
  if (sourceId === targetId) {
    return {
      ok: false,
      error: "Escolha uma categoria de destino diferente.",
    };
  }

  const source = db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, sourceId),
        ws(categories.workspaceId),
      ),
    )
    .get();
  if (!source) return { ok: false, error: "Categoria de origem não encontrada." };

  const target = db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, targetId),
        ws(categories.workspaceId),
        isNull(categories.deletedAt),
      ),
    )
    .get();
  if (!target) {
    return { ok: false, error: "Categoria de destino não encontrada." };
  }

  if (source.isSystem) {
    return {
      ok: false,
      code: "SYSTEM_CATEGORY",
      error: "Categoria de sistema não pode ser mesclada.",
    };
  }
  if (source.tipo !== target.tipo) {
    return {
      ok: false,
      error: "As categorias precisam ser do mesmo tipo.",
    };
  }

  const childCount = countChildrenForCategory(workspaceId, sourceId);
  if (childCount > 0) {
    return {
      ok: false,
      code: "HAS_CHILDREN",
      error:
        "Esta categoria possui subcategorias. Mescle ou mova as subcategorias primeiro.",
    };
  }

  const moved = db.transaction((tx) => {
    const updatedTransactions = tx
      .update(transactions)
      .set({ categoriaId: targetId, updatedAt: new Date() })
      .where(
        and(
          eq(transactions.categoriaId, sourceId),
          eq(transactions.workspaceId, workspaceId),
        ),
      )
      .run();

    // Campo legado (Etapa 1). É NOT NULL e tem cascade: precisa ser atualizado
    // antes de excluir a categoria de origem.
    tx.update(budgets)
      .set({ categoriaId: targetId, updatedAt: new Date() })
      .where(
        and(
          eq(budgets.categoriaId, sourceId),
          eq(budgets.workspaceId, workspaceId),
        ),
      )
      .run();

    const budgetCategoryRows = tx
      .select()
      .from(budgetCategories)
      .where(ws(budgetCategories.workspaceId))
      .all();
    const budgetsWithTarget = new Set(
      budgetCategoryRows
        .filter((row) => row.categoryId === targetId)
        .map((row) => row.budgetId),
    );

    for (const row of budgetCategoryRows.filter(
      (item) => item.categoryId === sourceId,
    )) {
      if (budgetsWithTarget.has(row.budgetId)) {
        // O orçamento já cobre a categoria de destino: remove a duplicidade.
        tx.delete(budgetCategories)
          .where(
            and(
              eq(budgetCategories.workspaceId, workspaceId),
              eq(budgetCategories.budgetId, row.budgetId),
              eq(budgetCategories.categoryId, sourceId),
            ),
          )
          .run();
        continue;
      }

      tx.update(budgetCategories)
        .set({ categoryId: targetId })
        .where(
          and(
            eq(budgetCategories.workspaceId, workspaceId),
            eq(budgetCategories.budgetId, row.budgetId),
            eq(budgetCategories.categoryId, sourceId),
          ),
        )
        .run();
      budgetsWithTarget.add(row.budgetId);
    }

    const versions = tx
      .select({
        id: budgetVersions.id,
        categoriaIds: budgetVersions.categoriaIds,
      })
      .from(budgetVersions)
      .where(ws(budgetVersions.workspaceId))
      .all();
    for (const version of versions) {
      if (!version.categoriaIds.includes(sourceId)) continue;
      const next = [
        ...new Set(
          version.categoriaIds.map((id) =>
            id === sourceId ? targetId : id,
          ),
        ),
      ];
      tx.update(budgetVersions)
        .set({ categoriaIds: next, updatedAt: new Date() })
        .where(eq(budgetVersions.id, version.id))
        .run();
    }

    const exceptions = tx
      .select({
        id: budgetCycleExceptions.id,
        dados: budgetCycleExceptions.dados,
      })
      .from(budgetCycleExceptions)
      .where(ws(budgetCycleExceptions.workspaceId))
      .all();
    for (const exception of exceptions) {
      const ids = exception.dados?.categoriaIds;
      if (!Array.isArray(ids) || !ids.includes(sourceId)) continue;
      const next = [
        ...new Set(ids.map((id) => (id === sourceId ? targetId : id))),
      ];
      tx.update(budgetCycleExceptions)
        .set({
          dados: { ...exception.dados, categoriaIds: next },
          updatedAt: new Date(),
        })
        .where(eq(budgetCycleExceptions.id, exception.id))
        .run();
    }

    const recurring = tx
      .select({
        id: recurrences.id,
        template: recurrences.template,
      })
      .from(recurrences)
      .where(ws(recurrences.workspaceId))
      .all();
    for (const recurrence of recurring) {
      if (recurrence.template.categoriaId !== sourceId) continue;
      tx.update(recurrences)
        .set({
          template: { ...recurrence.template, categoriaId: targetId },
          updatedAt: new Date(),
        })
        .where(eq(recurrences.id, recurrence.id))
        .run();
    }

    tx.delete(categories)
      .where(
        and(
          eq(categories.id, sourceId),
          eq(categories.workspaceId, workspaceId),
        ),
      )
      .run();

    return updatedTransactions.changes;
  });

  revalidateCategories();
  return { ok: true, id: targetId, count: moved };
}
