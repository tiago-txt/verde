import { and, asc, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  budgetCategories,
  budgetOverrides,
  budgets,
  categories,
  creditCards,
  recurrences,
  tags,
  transactionTags,
  transactions,
} from "@/lib/db/schema";
import { getTagsForTransactions } from "./transactions";

export type ExportedTransaction = {
  id: string;
  tipo: "despesa" | "receita" | "transferencia";
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  contaNome: string | null;
  cartaoNome: string | null;
  contaDestinoNome: string | null;
  cartaoDestinoNome: string | null;
  categoriaNome: string | null;
  observacao: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  tags: string[];
};

export function exportAllData(workspaceId: string) {
  const { db, ws } = scopedDb(workspaceId);
  return {
    app: "verde",
    version: 2,
    exportedAt: new Date().toISOString(),
    data: {
      accounts: db
        .select()
        .from(accounts)
        .where(ws(accounts.workspaceId))
        .all(),
      creditCards: db
        .select()
        .from(creditCards)
        .where(ws(creditCards.workspaceId))
        .all(),
      categories: db
        .select()
        .from(categories)
        .where(ws(categories.workspaceId))
        .all(),
      tags: db.select().from(tags).where(ws(tags.workspaceId)).all(),
      transactions: db
        .select()
        .from(transactions)
        .where(ws(transactions.workspaceId))
        .all(),
      transactionTags: db
        .select()
        .from(transactionTags)
        .where(ws(transactionTags.workspaceId))
        .all(),
      recurrences: db
        .select()
        .from(recurrences)
        .where(ws(recurrences.workspaceId))
        .all(),
      budgets: db.select().from(budgets).where(ws(budgets.workspaceId)).all(),
      budgetCategories: db
        .select()
        .from(budgetCategories)
        .where(ws(budgetCategories.workspaceId))
        .all(),
      budgetOverrides: db
        .select()
        .from(budgetOverrides)
        .where(ws(budgetOverrides.workspaceId))
        .all(),
    },
  };
}

export function listTransactionsForExport(
  workspaceId: string,
  from: string,
  to: string,
): ExportedTransaction[] {
  const { db, ws } = scopedDb(workspaceId);
  const rows = db
    .select({
      id: transactions.id,
      tipo: transactions.tipo,
      descricao: transactions.descricao,
      valor: transactions.valor,
      data: transactions.data,
      pago: transactions.pago,
      contaId: transactions.contaId,
      cartaoId: transactions.cartaoId,
      contaDestinoId: transactions.contaDestinoId,
      cartaoDestinoId: transactions.cartaoDestinoId,
      categoriaId: transactions.categoriaId,
      observacao: transactions.observacao,
      parcelaAtual: transactions.parcelaAtual,
      parcelaTotal: transactions.parcelaTotal,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        gte(transactions.data, from),
        lte(transactions.data, to),
      ),
    )
    .orderBy(asc(transactions.data), asc(transactions.createdAt))
    .all();

  const accountNames = new Map(
    db
      .select({ id: accounts.id, nome: accounts.nome })
      .from(accounts)
      .where(ws(accounts.workspaceId))
      .all()
      .map((row) => [row.id, row.nome]),
  );
  const cardNames = new Map(
    db
      .select({ id: creditCards.id, nome: creditCards.nome })
      .from(creditCards)
      .where(ws(creditCards.workspaceId))
      .all()
      .map((row) => [row.id, row.nome]),
  );
  const categoryNames = new Map(
    db
      .select({ id: categories.id, nome: categories.nome })
      .from(categories)
      .where(ws(categories.workspaceId))
      .all()
      .map((row) => [row.id, row.nome]),
  );
  const tagMap = getTagsForTransactions(
    workspaceId,
    rows.map((row) => row.id),
  );

  return rows.map((row) => ({
    id: row.id,
    tipo: row.tipo,
    descricao: row.descricao,
    valor: row.valor,
    data: row.data,
    pago: row.pago,
    contaNome: row.contaId ? accountNames.get(row.contaId) ?? null : null,
    cartaoNome: row.cartaoId ? cardNames.get(row.cartaoId) ?? null : null,
    contaDestinoNome: row.contaDestinoId
      ? accountNames.get(row.contaDestinoId) ?? null
      : null,
    cartaoDestinoNome: row.cartaoDestinoId
      ? cardNames.get(row.cartaoDestinoId) ?? null
      : null,
    categoriaNome: row.categoriaId
      ? categoryNames.get(row.categoriaId) ?? null
      : null,
    observacao: row.observacao,
    parcelaAtual: row.parcelaAtual,
    parcelaTotal: row.parcelaTotal,
    tags: (tagMap.get(row.id) ?? []).map((tag) => tag.nome),
  }));
}

export type LatestImportBatch = {
  batchId: string;
  createdAt: Date | number;
  count: number;
};

export function getLatestImportBatch(
  workspaceId: string,
): LatestImportBatch | null {
  const { db, ws } = scopedDb(workspaceId);
  const row = db
    .select({
      batchId: transactions.importBatchId,
      createdAt: transactions.createdAt,
      count: transactions.id,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNotNull(transactions.importBatchId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1)
    .get();

  if (!row?.batchId) return null;
  const count = db
    .select({ count: transactions.id })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        eq(transactions.importBatchId, row.batchId),
        isNull(transactions.deletedAt),
      ),
    )
    .all().length;

  return { batchId: row.batchId, createdAt: row.createdAt, count };
}
