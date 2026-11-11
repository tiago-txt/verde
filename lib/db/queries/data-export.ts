import { and, asc, desc, eq, gte, isNotNull, isNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
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

const account = accounts;
const contaDestino = accounts;

export function exportAllData() {
  const db = getDb();
  return {
    app: "verde",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: {
      accounts: db.select().from(accounts).all(),
      creditCards: db.select().from(creditCards).all(),
      categories: db.select().from(categories).all(),
      tags: db.select().from(tags).all(),
      transactions: db.select().from(transactions).all(),
      transactionTags: db.select().from(transactionTags).all(),
      recurrences: db.select().from(recurrences).all(),
      budgets: db.select().from(budgets).all(),
      budgetCategories: db.select().from(budgetCategories).all(),
      budgetOverrides: db.select().from(budgetOverrides).all(),
    },
  };
}

export function listTransactionsForExport(
  from: string,
  to: string,
): ExportedTransaction[] {
  const db = getDb();
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
      .all()
      .map((row) => [row.id, row.nome]),
  );
  const cardNames = new Map(
    db
      .select({ id: creditCards.id, nome: creditCards.nome })
      .from(creditCards)
      .all()
      .map((row) => [row.id, row.nome]),
  );
  const categoryNames = new Map(
    db
      .select({ id: categories.id, nome: categories.nome })
      .from(categories)
      .all()
      .map((row) => [row.id, row.nome]),
  );
  const tagMap = getTagsForTransactions(rows.map((row) => row.id));

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

export function getLatestImportBatch(): LatestImportBatch | null {
  const row = getDb()
    .select({
      batchId: transactions.importBatchId,
      createdAt: transactions.createdAt,
      count: transactions.id,
    })
    .from(transactions)
    .where(
      and(
        isNotNull(transactions.importBatchId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1)
    .get();

  if (!row?.batchId) return null;
  const count = getDb()
    .select({ count: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.importBatchId, row.batchId),
        isNull(transactions.deletedAt),
      ),
    )
    .all().length;

  return { batchId: row.batchId, createdAt: row.createdAt, count };
}
