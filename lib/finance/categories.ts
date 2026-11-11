import type { TransactionType } from "@/lib/db/schema";

export type SystemCategoryIds = {
  despesa: string | null;
  receita: string | null;
};

export type CategoryResolutionInput = {
  tipo: TransactionType;
  categoriaId: string | null;
};

/**
 * Resolve a categoria final de um lançamento.
 * - transferência: sempre null;
 * - categoria informada: mantém;
 * - despesa/receita sem categoria: usa "Outros" do tipo correspondente.
 */
export function resolveCategoryId(
  input: CategoryResolutionInput,
  system: SystemCategoryIds,
): string | null {
  if (input.tipo === "transferencia") return null;
  if (input.categoriaId) return input.categoriaId;
  return input.tipo === "despesa" ? system.despesa : system.receita;
}

/** Lançamento antigo sem categoria que precisa do backfill para "Outros". */
export function shouldBackfillCategory(input: {
  tipo: TransactionType;
  categoriaId: string | null;
}): boolean {
  return input.tipo !== "transferencia" && !input.categoriaId;
}

export function isSystemCategory(category: { isSystem: boolean }): boolean {
  return category.isSystem;
}

export function canDeleteCategory(category: { isSystem: boolean }): boolean {
  return !category.isSystem;
}

export function canArchiveCategory(category: { isSystem: boolean }): boolean {
  return !category.isSystem;
}

export function canMoveCategoryToParent(
  category: { isSystem: boolean; categoriaPaiId: string | null },
  parentId: string | null,
): boolean {
  if (!category.isSystem) return true;
  return category.categoriaPaiId === parentId;
}
