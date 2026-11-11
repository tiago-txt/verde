import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  isNull,
  like,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { getDb } from "@/lib/db";
import {
  accounts,
  categories,
  recurrences,
  tags,
  transactionTags,
  transactions,
  type RecurrenceFrequency,
  type RecurrenceTemplate,
  type TransactionType,
} from "@/lib/db/schema";
import { eachDayOfMonth, monthRange, todayISO } from "@/lib/dates";
import { resolveCategoryId } from "@/lib/finance/categories";
import { computeDayBalancesFromDeltas } from "@/lib/finance/day-balance";
import type { TransactionFilters } from "@/lib/finance/filters";
import {
  generateRecurrenceDates,
  recurrenceHorizon,
} from "@/lib/finance/recurrence";
import { listAllAccounts } from "./accounts";
import {
  getSystemCategoryIds,
  listAllCategories,
  listTags,
} from "./categories";

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
  contaDestinoCor: string | null;
  contaDestinoIcone: string | null;
  cartaoId: string | null;
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

export type TransactionDetail = TransactionListItem & {
  recorrenciaFrequencia: RecurrenceFrequency | null;
  prevId: string | null;
  nextId: string | null;
  occurrenceIndex: number | null;
  occurrenceCount: number | null;
};

export type RecentDescription = {
  descricao: string;
  categoriaId: string | null;
  contaId: string | null;
  valor: number;
  categoriaNome: string | null;
  categoriaIcone: string | null;
  categoriaCor: string | null;
};

export type TransactionFormData = {
  accounts: ReturnType<typeof listAllAccounts>;
  categories: ReturnType<typeof listAllCategories>;
  tags: ReturnType<typeof listTags>;
  lastAccountId: string | null;
  recentDescriptions: RecentDescription[];
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
    contaDestinoCor: contaDestino.cor,
    contaDestinoIcone: contaDestino.icone,
    cartaoId: transactions.cartaoId,
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

/**
 * Lista do mês com todos os filtros aplicados no SQL.
 * O resumo é calculado no cliente a partir deste resultado (reflete filtros).
 */
export function listMonthTransactions(
  filters: TransactionFilters,
): TransactionListItem[] {
  const db = getDb();
  const { start, end } = monthRange(filters.mes);
  const conditions = [
    isNull(transactions.deletedAt),
    gte(transactions.data, start),
    lte(transactions.data, end),
  ];

  if (filters.tipo) conditions.push(eq(transactions.tipo, filters.tipo));
  if (filters.status === "pagos") conditions.push(eq(transactions.pago, true));
  if (filters.status === "nao_pagos")
    conditions.push(eq(transactions.pago, false));

  if (filters.contas.length > 0) {
    const accountFilter = or(
      inArray(transactions.contaId, filters.contas),
      inArray(transactions.contaDestinoId, filters.contas),
    );
    if (accountFilter) conditions.push(accountFilter);
  }

  if (filters.categorias.length > 0) {
    conditions.push(inArray(transactions.categoriaId, filters.categorias));
  }

  if (filters.tags.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(transactionTags)
          .where(
            and(
              eq(transactionTags.transactionId, transactions.id),
              inArray(transactionTags.tagId, filters.tags),
            ),
          ),
      ),
    );
  }

  if (filters.q) {
    const pattern = `%${filters.q}%`;
    const searchFilter = or(
      like(transactions.descricao, pattern),
      like(transactions.observacao, pattern),
    );
    if (searchFilter) conditions.push(searchFilter);
  }

  const rows = db
    .select(selectTransactionFields())
    .from(transactions)
    .leftJoin(conta, eq(transactions.contaId, conta.id))
    .leftJoin(contaDestino, eq(transactions.contaDestinoId, contaDestino.id))
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .where(and(...conditions))
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

export function getTransactionDetail(id: string): TransactionDetail | null {
  const transaction = getTransactionById(id);
  if (!transaction) return null;

  const db = getDb();
  let prevId: string | null = null;
  let nextId: string | null = null;
  let occurrenceIndex: number | null = null;
  let occurrenceCount: number | null = null;
  let recorrenciaFrequencia: RecurrenceFrequency | null = null;

  if (transaction.recorrenciaId) {
    const recurrence = db
      .select({ frequencia: recurrences.frequencia })
      .from(recurrences)
      .where(eq(recurrences.id, transaction.recorrenciaId))
      .get();
    recorrenciaFrequencia = recurrence?.frequencia ?? null;

    const siblings = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.recorrenciaId, transaction.recorrenciaId),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(asc(transactions.data), asc(transactions.createdAt))
      .all();

    const index = siblings.findIndex((row) => row.id === id);
    if (index >= 0) {
      occurrenceIndex = index + 1;
      occurrenceCount = siblings.length;
      prevId = siblings[index - 1]?.id ?? null;
      nextId = siblings[index + 1]?.id ?? null;
    }
  } else if (transaction.parcelaGrupoId) {
    const siblings = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          eq(transactions.parcelaGrupoId, transaction.parcelaGrupoId),
          isNull(transactions.deletedAt),
        ),
      )
      .orderBy(asc(transactions.parcelaAtual))
      .all();

    const index = siblings.findIndex((row) => row.id === id);
    if (index >= 0) {
      occurrenceIndex = index + 1;
      occurrenceCount = siblings.length;
      prevId = siblings[index - 1]?.id ?? null;
      nextId = siblings[index + 1]?.id ?? null;
    }
  }

  return {
    ...transaction,
    recorrenciaFrequencia,
    prevId,
    nextId,
    occurrenceIndex,
    occurrenceCount,
  };
}

export function getTransactionRaw(id: string) {
  return getDb()
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get();
}

export function getTransactionFormData(): TransactionFormData {
  const db = getDb();

  const lastAccount = db
    .select({ contaId: transactions.contaId })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        isNotNull(transactions.contaId),
      ),
    )
    .orderBy(desc(transactions.createdAt))
    .limit(1)
    .get();

  const recentRows = db
    .select({
      descricao: transactions.descricao,
      categoriaId: transactions.categoriaId,
      contaId: transactions.contaId,
      valor: transactions.valor,
      categoriaNome: categories.nome,
      categoriaIcone: categories.icone,
      categoriaCor: categories.cor,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .where(isNull(transactions.deletedAt))
    .orderBy(desc(transactions.createdAt))
    .limit(200)
    .all();

  const seen = new Set<string>();
  const recentDescriptions: RecentDescription[] = [];

  for (const row of recentRows) {
    const key = row.descricao.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    recentDescriptions.push(row);
    if (recentDescriptions.length >= 20) break;
  }

  return {
    accounts: listAllAccounts(),
    categories: listAllCategories(),
    tags: listTags(),
    lastAccountId: lastAccount?.contaId ?? null,
    recentDescriptions,
  };
}

/**
 * Saldo total das contas ao final de cada dia do mês.
 * Query agregada única (sem N+1), sempre sem filtros.
 */
export function getDayBalances(monthKey: string): Record<string, number> {
  const db = getDb();
  const { end } = monthRange(monthKey);

  const initialTotal =
    db
      .select({
        value: sql<number>`coalesce(sum(${accounts.saldoInicial}), 0)`,
      })
      .from(accounts)
      .where(isNull(accounts.deletedAt))
      .get()?.value ?? 0;

  const deltas = db
    .select({
      data: transactions.data,
      delta: sql<number>`coalesce(sum(case when ${transactions.tipo} = 'receita' then ${transactions.valor} when ${transactions.tipo} = 'despesa' then -${transactions.valor} else 0 end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.deletedAt),
        isNull(transactions.cartaoId),
        lte(transactions.data, end),
      ),
    )
    .groupBy(transactions.data)
    .all();

  const balances = computeDayBalancesFromDeltas(
    initialTotal,
    deltas,
    eachDayOfMonth(monthKey),
  );

  return Object.fromEntries(balances);
}

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
  const systemCategoryIds = getSystemCategoryIds();
  const accountIds = new Set(
    listAllAccounts()
      .filter((account) => !account.arquivada)
      .map((account) => account.id),
  );
  const categoryById = new Map(
    listAllCategories().map((category) => [category.id, category]),
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

      const existingCategory = template.categoriaId
        ? categoryById.get(template.categoriaId)
        : null;
      const resolvedCategoryId =
        template.tipo === "transferencia"
          ? null
          : existingCategory?.id ??
            resolveCategoryId(
              { tipo: template.tipo, categoriaId: null },
              systemCategoryIds,
            );

      if (template.tipo !== "transferencia" && !resolvedCategoryId) continue;

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
            categoriaId: resolvedCategoryId,
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
