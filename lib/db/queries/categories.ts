import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
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

export function listCategoriesWithCounts(
  workspaceId: string,
): CategoryWithCount[] {
  const { db, ws } = scopedDb(workspaceId);

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
      workspaceId: categories.workspaceId,
      transactionCount: sql<number>`count(${transactions.id})`,
    })
    .from(categories)
    .leftJoin(
      transactions,
      and(
        eq(transactions.categoriaId, categories.id),
        eq(transactions.workspaceId, workspaceId),
        isNull(transactions.deletedAt),
      ),
    )
    .where(ws(categories.workspaceId))
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

export function listAllCategories(workspaceId: string) {
  const { db, ws } = scopedDb(workspaceId);
  return db
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
    .where(ws(categories.workspaceId))
    .orderBy(asc(categories.tipo), asc(categories.nome))
    .all();
}

/** IDs das categorias de sistema "Outros" por tipo no workspace. */
export function getSystemCategoryIds(workspaceId: string): {
  despesa: string | null;
  receita: string | null;
} {
  const { db, ws } = scopedDb(workspaceId);
  const rows = db
    .select({ id: categories.id, tipo: categories.tipo })
    .from(categories)
    .where(and(ws(categories.workspaceId), eq(categories.isSystem, true)))
    .all();

  return {
    despesa: rows.find((row) => row.tipo === "despesa")?.id ?? null,
    receita: rows.find((row) => row.tipo === "receita")?.id ?? null,
  };
}

export function getCategoryById(workspaceId: string, id: string) {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select()
    .from(categories)
    .where(
      and(
        eq(categories.id, id),
        ws(categories.workspaceId),
        isNull(categories.deletedAt),
      ),
    )
    .get();
}

export function countTransactionsForCategory(
  workspaceId: string,
  id: string,
): number {
  const { db, ws } = scopedDb(workspaceId);
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        eq(transactions.categoriaId, id),
        isNull(transactions.deletedAt),
      ),
    )
    .get();

  return result?.count ?? 0;
}

export function countChildrenForCategory(
  workspaceId: string,
  id: string,
): number {
  const { db, ws } = scopedDb(workspaceId);
  const result = db
    .select({ count: sql<number>`count(*)` })
    .from(categories)
    .where(
      and(ws(categories.workspaceId), eq(categories.categoriaPaiId, id)),
    )
    .get();

  return result?.count ?? 0;
}

export type TagWithCount = Tag & { transactionCount: number };

export function listTagsWithCounts(workspaceId: string): TagWithCount[] {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select({
      id: tags.id,
      nome: tags.nome,
      createdAt: tags.createdAt,
      workspaceId: tags.workspaceId,
      transactionCount: sql<number>`count(${transactionTags.transactionId})`,
    })
    .from(tags)
    .leftJoin(
      transactionTags,
      and(
        eq(transactionTags.tagId, tags.id),
        eq(transactionTags.workspaceId, workspaceId),
      ),
    )
    .where(ws(tags.workspaceId))
    .groupBy(tags.id)
    .orderBy(asc(tags.nome))
    .all();
}

export function listTags(workspaceId: string) {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select({ id: tags.id, nome: tags.nome })
    .from(tags)
    .where(ws(tags.workspaceId))
    .orderBy(asc(tags.nome))
    .all();
}