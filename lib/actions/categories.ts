"use server";

import { and, eq, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { scopedDb } from "@/lib/db/scoped";
import { categories, transactions } from "@/lib/db/schema";
import {
  countChildrenForCategory,
  countTransactionsForCategory,
  getCategoryById,
} from "@/lib/db/queries/categories";
import {
  categoryInputSchema,
  type CategoryInput,
} from "@/lib/validation/categories";
import { idSchema } from "@/lib/validation/common";
import type { ActionResult } from "./result";

function revalidateCategories() {
  revalidatePath("/");
  revalidatePath("/lancamentos");
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
