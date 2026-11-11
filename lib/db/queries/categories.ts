import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  categories,
  tags,
  transactionTags,
  transactions,
  type Category,
  type Tag,
} from "@/lib/db/schema";

export type CategoryWithCount = Category & {
  transactionCount: number;
  childrenCount: number;
};

export function listCategoriesWithCounts(): CategoryWithCount[] {
  const db = getDb();

  const rows = db
    .select({
      id: categories.id,
      nome: categories.nome,
      tipo: categories.tipo,
      icone: categories.icone,
      cor: categories.cor,
      categoriaPaiId: categories.categoriaPaiId,
      isSystem: categories.isSystem,
      createdAt: categories.createdAt,
      updatedAt: categories.updatedAt,
      deletedAt: categories.deletedAt,
      transactionCount: sql<number>`count(${transactions.id})`,
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(
        eq(transactions.categoriaId, categories.id),
        isNull(transactions.deletedAt),
      ),
    )
    .groupBy(categories.id)
    .orderBy(asc(categories.tipo), asc(categories.nome))
    .all();

  const childrenCount = new Map<string, number>();
  for (const row of rows) {
    if (row.categoriaPaiId) {
      childrenCount.set(
        row.categoriaPaiId,
        (childrenCount.get(row.categoriaPaiId) ?? 0) + 1,
      );
    }
  }

  return rows.map((row) => ({
    ...row,
    childrenCount: childrenCount.get(row.id) ?? 0,
  }));
}

export function listAllCategories() {
  return getDb()
    .select({
      id: categories.id,
      nome: categories.nome,
      tipo: categories.tipo,
      icone: categories.icone,
      cor: categories.cor,
      categoriaPaiId: categories.categoriaPaiId,
      isSystem: categories.isSystem,
      deletedAt: categories.deletedAt,
    })
    .from(categories)
    .orderBy(asc(categories.tipo), asc(categories.nome))
    .all();
}

/** IDs das categorias de sistema "Outros" por tipo. */
export function getSystemCategoryIds(): {
  despesa: string | null;
  receita: string | null;
} {
  const rows = getDb()
    .select({ id: categories.id, tipo: categories.tipo })
    .from(categories)
    .where(eq(categories.isSystem, true))
    .all();

  return {
    despesa: rows.find((row) => row.tipo === "despesa")?.id ?? null,
    receita: rows.find((row) => row.tipo === "receita")?.id ?? null,
  };
}

export function getCategoryById(id: string) {
  return getDb()
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
    .get();
}

export function countTransactionsForCategory(id: string): number {
  const result = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        eq(transactions.categoriaId, id),
        isNull(transactions.deletedAt),
      ),
    )
    .get();

  return result?.count ?? 0;
}

export function countChildrenForCategory(id: string): number {
  const result = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(eq(categories.categoriaPaiId, id))
    .get();

  return result?.count ?? 0;
}

export type TagWithCount = Tag & { transactionCount: number };

export function listTagsWithCounts(): TagWithCount[] {
  return getDb()
    .select({
      id: tags.id,
      nome: tags.nome,
      createdAt: tags.createdAt,
      transactionCount: sql<number>`count(${transactionTags.transactionId})`,
    })
    .from(tags)
    .leftJoin(transactionTags, eq(transactionTags.tagId, tags.id))
    .groupBy(tags.id)
    .orderBy(asc(tags.nome))
    .all();
}

export function listTags() {
  return getDb()
    .select({ id: tags.id, nome: tags.nome })
    .from(tags)
    .orderBy(asc(tags.nome))
    .all();
}
