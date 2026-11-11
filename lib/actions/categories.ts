"use server";

import { and, eq, isNull, ne, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
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
  parentId: string | null,
  tipo: CategoryInput["tipo"],
  categoryId?: string,
): string | null {
  if (!parentId) return null;

  const parent = getDb()
    .select()
    .from(categories)
    .where(eq(categories.id, parentId))
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
  await requireUser();

  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const parentError = validateParent(
    parsed.data.categoriaPaiId,
    parsed.data.tipo,
  );
  if (parentError) return { ok: false, error: parentError };

  const id = crypto.randomUUID();
  getDb()
    .insert(categories)
    .values({ id, ...parsed.data })
    .run();

  revalidateCategories();
  return { ok: true, id };
}

export async function updateCategoryAction(
  id: string,
  input: CategoryInput,
): Promise<ActionResult> {
  await requireUser();

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

  const existing = getCategoryById(parsedId.data);
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

  const childCount = countChildrenForCategory(parsedId.data);
  if (childCount > 0 && parsed.data.categoriaPaiId) {
    return {
      ok: false,
      error:
        "Esta categoria possui subcategorias e não pode virar subcategoria.",
    };
  }

  const parentError = validateParent(
    parsed.data.categoriaPaiId,
    parsed.data.tipo,
    parsedId.data,
  );
  if (parentError) return { ok: false, error: parentError };

  getDb()
    .update(categories)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(categories.id, parsedId.data))
    .run();

  revalidateCategories();
  return { ok: true, id: parsedId.data };
}

export async function setCategoryArchivedAction(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  await requireUser();

  const parsed = z
    .object({ id: idSchema, archived: z.boolean() })
    .safeParse({ id, archived });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const existing = getCategoryById(parsed.data.id);
  if (!existing) return { ok: false, error: "Categoria não encontrada." };

  if (existing.isSystem && parsed.data.archived) {
    return {
      ok: false,
      code: "SYSTEM_CATEGORY",
      error: "Categoria de sistema não pode ser arquivada.",
    };
  }

  getDb()
    .update(categories)
    .set({
      deletedAt: parsed.data.archived ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(
      or(
        eq(categories.id, parsed.data.id),
        eq(categories.categoriaPaiId, parsed.data.id),
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
  await requireUser();

  const parsed = z
    .object({
      id: idSchema,
      moveToId: idSchema.nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Categoria inválida." };

  const { id, moveToId } = parsed.data;

  const existing = getDb()
    .select()
    .from(categories)
    .where(eq(categories.id, id))
    .get();
  if (!existing) return { ok: false, error: "Categoria não encontrada." };

  if (existing.isSystem) {
    return {
      ok: false,
      code: "SYSTEM_CATEGORY",
      error: "Categoria de sistema não pode ser excluída.",
    };
  }

  const childCount = countChildrenForCategory(id);
  if (childCount > 0) {
    return {
      ok: false,
      code: "HAS_CHILDREN",
      error:
        "Esta categoria possui subcategorias. Exclua ou mova as subcategorias primeiro.",
    };
  }

  const transactionCount = countTransactionsForCategory(id);
  if (transactionCount > 0 && !moveToId) {
    return {
      ok: false,
      code: "HAS_TRANSACTIONS",
      error: `Esta categoria possui ${transactionCount} lançamento(s). Escolha outra categoria para mover os lançamentos ou arquive esta categoria.`,
    };
  }

  if (moveToId) {
    const target = getDb()
      .select()
      .from(categories)
      .where(and(eq(categories.id, moveToId), isNull(categories.deletedAt)))
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

  getDb().transaction((tx) => {
    if (moveToId) {
      tx.update(transactions)
        .set({ categoriaId: moveToId, updatedAt: new Date() })
        .where(eq(transactions.categoriaId, id))
        .run();
    }
    tx.delete(categories).where(eq(categories.id, id)).run();
  });

  revalidateCategories();
  return { ok: true };
}
