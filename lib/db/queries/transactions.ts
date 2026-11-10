import { and, asc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/lib/db";
import {
  accounts,
  categories,
  recurrences,
  tags,
  transactionTags,
  transactions,
  type RecurrenceTemplate,
  type TransactionType,
} from "@/lib/db/schema";
import { monthRange, todayISO } from "@/lib/dates";
import {
  generateRecurrenceDates,
  recurrenceHorizon,
} from "@/lib/finance/recurrence";
import { listAllAccounts } from "./accounts";
import { listAllCategories, listTags } from "./categories";

export type TransactionTag = { id: string; nome: string };

export type TransactionListItem = {
  id: string;
  tipo: TransactionType;
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  contaId: string | null;
  contaNome: string | null;
  contaCor: string | null;
  contaIcone: string | null;
  contaDestinoId: string | null;
  contaDestinoNome: string | null;
  categoriaId: string | null;
  categoriaNome: string | null;
  categoriaCor: string | null;
  categoriaIcone: string | null;
  observacao: string | null;
  recorrenciaId: string | null;
  parcelaGrupoId: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  tags: TransactionTag[];
};

const conta = alias(accounts, "conta");
const contaDestino = alias(accounts, "conta_destino");

function selectTransactionFields() {
  return {
    id: transactions.id,
    tipo: transactions.tipo,
    descricao: transactions.descricao,
    valor: transactions.valor,
    data: transactions.data,
    pago: transactions.pago,
    contaId: transactions.contaId,
    contaNome: conta.nome,
    contaCor: conta.cor,
    contaIcone: conta.icone,
    contaDestinoId: transactions.contaDestinoId,
    contaDestinoNome: contaDestino.nome,
    categoriaId: transactions.categoriaId,
    categoriaNome: categories.nome,
    categoriaCor: categories.cor,
    categoriaIcone: categories.icone,
    observacao: transactions.observacao,
    recorrenciaId: transactions.recorrenciaId,
    parcelaGrupoId: transactions.parcelaGrupoId,
    parcelaAtual: transactions.parcelaAtual,
    parcelaTotal: transactions.parcelaTotal,
  };
}

export function getTagsForTransactions(
  ids: string[],
): Map<string, TransactionTag[]> {
  const map = new Map<string, TransactionTag[]>();
  if (ids.length === 0) return map;

  const rows = getDb()
    .select({
      transactionId: transactionTags.transactionId,
      id: tags.id,
      nome: tags.nome,
    })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tagId, tags.id))
    .where(inArray(transactionTags.transactionId, ids))
    .orderBy(asc(tags.nome))
    .all();

  for (const row of rows) {
    const list = map.get(row.transactionId) ?? [];
    list.push({ id: row.id, nome: row.nome });
    map.set(row.transactionId, list);
  }

  return map;
}

export function listMonthTransactions(monthKey: string): TransactionListItem[] {
  const { start, end } = monthRange(monthKey);

  const rows = getDb()
    .select(selectTransactionFields())
    .from(transactions)
    .leftJoin(conta, eq(transactions.contaId, conta.id))
    .leftJoin(contaDestino, eq(transactions.contaDestinoId, contaDestino.id))
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .where(
      and(
        isNull(transactions.deletedAt),
        gte(transactions.data, start),
        lte(transactions.data, end),
      ),
    )
    .orderBy(asc(transactions.data), asc(transactions.createdAt))
    .all();

  const tagMap = getTagsForTransactions(rows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    tags: tagMap.get(row.id) ?? [],
  }));
}

export function getTransactionById(id: string): TransactionListItem | null {
  const row = getDb()
    .select(selectTransactionFields())
    .from(transactions)
    .leftJoin(conta, eq(transactions.contaId, conta.id))
    .leftJoin(contaDestino, eq(transactions.contaDestinoId, contaDestino.id))
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get();

  if (!row) return null;

  const tagMap = getTagsForTransactions([id]);
  return { ...row, tags: tagMap.get(id) ?? [] };
}

export function getTransactionRaw(id: string) {
  return getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get();
}

export function getTransactionFormData() {
  return {
    accounts: listAllAccounts(),
    categories: listAllCategories(),
    tags: listTags(),
  };
}

export type TransactionFormData = ReturnType<typeof getTransactionFormData>;

/**
 * Gera as ocorrências que faltam para as recorrências ativas.
 * A unique index (recorrencia_id, data) + ON CONFLICT DO NOTHING tornam a
 * operação idempotente, inclusive quando uma ocorrência foi soft-deleted.
 */
export function ensureRecurrencesForMonth(monthKey: string): void {
  const db = getDb();
  const activeRecurrences = db
    .select()
    .from(recurrences)
    .where(eq(recurrences.ativo, true))
    .all();

  if (activeRecurrences.length === 0) return;

  const horizon = recurrenceHorizon(monthKey, todayISO());
  const accountIds = new Set(
    listAllAccounts()
      .filter((account) => !account.arquivada)
      .map((account) => account.id),
  );
  const categoryIds = new Set(
    listAllCategories()
      .filter((category) => !category.deletedAt)
      .map((category) => category.id),
  );
  const tagIds = new Set(listTags().map((tag) => tag.id));

  db.transaction((tx) => {
    for (const recurrence of activeRecurrences) {
      const template = recurrence.template as RecurrenceTemplate;

      if (!template.contaId || !accountIds.has(template.contaId)) continue;
      if (
        template.tipo === "transferencia" &&
        (!template.contaDestinoId || !accountIds.has(template.contaDestinoId))
      ) {
        continue;
      }
      if (
        template.tipo !== "transferencia" &&
        (!template.categoriaId || !categoryIds.has(template.categoriaId))
      ) {
        continue;
      }

      const dates = generateRecurrenceDates({
        frequencia: recurrence.frequencia,
        dataInicio: recurrence.dataInicio,
        dataFim: recurrence.dataFim,
        until: horizon,
      });

      const validTagIds = (template.tagIds ?? []).filter((tagId) =>
        tagIds.has(tagId),
      );

      for (const data of dates) {
        const transactionId = crypto.randomUUID();
        const inserted = tx
          .insert(transactions)
          .values({
            id: transactionId,
            tipo: template.tipo,
            descricao: template.descricao,
            valor: template.valor,
            data,
            pago: false,
            contaId: template.contaId,
            cartaoId: template.cartaoId,
            contaDestinoId:
              template.tipo === "transferencia"
                ? template.contaDestinoId
                : null,
            categoriaId:
              template.tipo === "transferencia"
                ? null
                : template.categoriaId &&
                    categoryIds.has(template.categoriaId)
                  ? template.categoriaId
                  : null,
            observacao: template.observacao,
            recorrenciaId: recurrence.id,
          })
          .onConflictDoNothing()
          .run();

        if (inserted.changes > 0 && validTagIds.length > 0) {
          tx.insert(transactionTags)
            .values(
              validTagIds.map((tagId) => ({
                transactionId,
                tagId,
              })),
            )
            .onConflictDoNothing()
            .run();
        }
      }
    }
  });
}
