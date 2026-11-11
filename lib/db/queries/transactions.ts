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
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  categories,
  creditCards,
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
import { listCardsForFilter, type CardOption } from "./cards";
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
  cartaoNome: string | null;
  cartaoCor: string | null;
  cartaoIcone: string | null;
  cartaoDestinoId: string | null;
  cartaoDestinoNome: string | null;
  cartaoDestinoCor: string | null;
  cartaoDestinoIcone: string | null;
  faturaChave: string | null;
  cartaoDiaFechamento: number | null;
  cartaoDiaVencimento: number | null;
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
  cards: CardOption[];
  categories: ReturnType<typeof listAllCategories>;
  tags: ReturnType<typeof listTags>;
  lastAccountId: string | null;
  lastCardId: string | null;
  recentDescriptions: RecentDescription[];
};

const conta = alias(accounts, "conta");
const contaDestino = alias(accounts, "conta_destino");
const cartao = alias(creditCards, "cartao");
const cartaoDestino = alias(creditCards, "cartao_destino");

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
    cartaoNome: cartao.nome,
    cartaoCor: cartao.cor,
    cartaoIcone: cartao.icone,
    cartaoDestinoId: transactions.cartaoDestinoId,
    cartaoDestinoNome: cartaoDestino.nome,
    cartaoDestinoCor: cartaoDestino.cor,
    cartaoDestinoIcone: cartaoDestino.icone,
    faturaChave: transactions.faturaChave,
    cartaoDiaFechamento: cartao.diaFechamento,
    cartaoDiaVencimento: cartao.diaVencimento,
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
  workspaceId: string,
  ids: string[],
): Map<string, TransactionTag[]> {
  const map = new Map<string, TransactionTag[]>();
  if (ids.length === 0) return map;

  const { db, ws } = scopedDb(workspaceId);
  const rows = db
    .select({
      transactionId: transactionTags.transactionId,
      id: tags.id,
      nome: tags.nome,
    })
    .from(transactionTags)
    .innerJoin(tags, eq(transactionTags.tagId, tags.id))
    .where(
      and(
        ws(transactionTags.workspaceId),
        eq(tags.workspaceId, workspaceId),
        inArray(transactionTags.transactionId, ids),
      ),
    )
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
  workspaceId: string,
  filters: TransactionFilters,
): TransactionListItem[] {
  const { db, ws } = scopedDb(workspaceId);
  const { start, end } =
    filters.de && filters.ate
      ? { start: filters.de, end: filters.ate }
      : monthRange(filters.mes);
  const conditions = [
    ws(transactions.workspaceId),
    isNull(transactions.deletedAt),
    gte(transactions.data, start),
    lte(transactions.data, end),
  ];

  if (filters.tipo) conditions.push(eq(transactions.tipo, filters.tipo));
  if (filters.status === "pagos") conditions.push(eq(transactions.pago, true));
  if (filters.status === "nao_pagos")
    conditions.push(eq(transactions.pago, false));

  if (filters.status !== "todos") {
    // Compras no cartão têm "pago" derivado da fatura e não entram no filtro.
    conditions.push(isNull(transactions.cartaoId));
  }

  if (filters.contas.length > 0 || filters.cartoes.length > 0) {
    const originFilters = [];
    if (filters.contas.length > 0) {
      const accountFilter = or(
        inArray(transactions.contaId, filters.contas),
        inArray(transactions.contaDestinoId, filters.contas),
      );
      if (accountFilter) originFilters.push(accountFilter);
    }
    if (filters.cartoes.length > 0) {
      const cardFilter = or(
        inArray(transactions.cartaoId, filters.cartoes),
        inArray(transactions.cartaoDestinoId, filters.cartoes),
      );
      if (cardFilter) originFilters.push(cardFilter);
    }
    const originFilter = or(...originFilters);
    if (originFilter) conditions.push(originFilter);
  }

  if (filters.cartoes.length === 0 && !filters.comprasCartao) {
    // Por padrão a lista mostra apenas faturas/pagamentos, não as compras.
    conditions.push(isNull(transactions.cartaoId));
  }

  if (filters.categorias.length > 0) {
    const categoryFilter = or(
      inArray(transactions.categoriaId, filters.categorias),
      inArray(categories.categoriaPaiId, filters.categorias),
    );
    if (categoryFilter) conditions.push(categoryFilter);
  }

  if (filters.tags.length > 0) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(transactionTags)
          .where(
            and(
              ws(transactionTags.workspaceId),
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
    .leftJoin(cartao, eq(transactions.cartaoId, cartao.id))
    .leftJoin(
      cartaoDestino,
      eq(transactions.cartaoDestinoId, cartaoDestino.id),
    )
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .where(and(...conditions))
    .orderBy(asc(transactions.data), asc(transactions.createdAt))
    .all();

  const tagMap = getTagsForTransactions(workspaceId, rows.map((row) => row.id));

  return rows.map((row) => ({
    ...row,
    tags: tagMap.get(row.id) ?? [],
  }));
}

export function getTransactionById(
  workspaceId: string,
  id: string,
): TransactionListItem | null {
  const { db, ws } = scopedDb(workspaceId);
  const row = db
    .select(selectTransactionFields())
    .from(transactions)
    .leftJoin(conta, eq(transactions.contaId, conta.id))
    .leftJoin(contaDestino, eq(transactions.contaDestinoId, contaDestino.id))
    .leftJoin(cartao, eq(transactions.cartaoId, cartao.id))
    .leftJoin(
      cartaoDestino,
      eq(transactions.cartaoDestinoId, cartaoDestino.id),
    )
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .where(
      and(
        eq(transactions.id, id),
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
      ),
    )
    .get();

  if (!row) return null;

  const tagMap = getTagsForTransactions(workspaceId, [id]);
  return { ...row, tags: tagMap.get(id) ?? [] };
}

export function getTransactionDetail(
  workspaceId: string,
  id: string,
): TransactionDetail | null {
  const transaction = getTransactionById(workspaceId, id);
  if (!transaction) return null;

  const { db, ws } = scopedDb(workspaceId);
  let prevId: string | null = null;
  let nextId: string | null = null;
  let occurrenceIndex: number | null = null;
  let occurrenceCount: number | null = null;
  let recorrenciaFrequencia: RecurrenceFrequency | null = null;

  if (transaction.recorrenciaId) {
    const recurrence = db
      .select({ frequencia: recurrences.frequencia })
      .from(recurrences)
      .where(
        and(
          eq(recurrences.id, transaction.recorrenciaId),
          ws(recurrences.workspaceId),
        ),
      )
      .get();
    recorrenciaFrequencia = recurrence?.frequencia ?? null;

    const siblings = db
      .select({ id: transactions.id })
      .from(transactions)
      .where(
        and(
          ws(transactions.workspaceId),
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
          ws(transactions.workspaceId),
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

export function getTransactionRaw(workspaceId: string, id: string) {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.id, id),
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
      ),
    )
    .get();
}

export function getTransactionFormData(workspaceId: string): TransactionFormData {
  const { db, ws } = scopedDb(workspaceId);

  const lastTransaction = db
    .select({
      contaId: transactions.contaId,
      cartaoId: transactions.cartaoId,
    })
    .from(transactions)
    .where(and(ws(transactions.workspaceId), isNull(transactions.deletedAt)))
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
    .where(and(ws(transactions.workspaceId), isNull(transactions.deletedAt)))
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
    accounts: listAllAccounts(workspaceId),
    cards: listCardsForFilter(workspaceId),
    categories: listAllCategories(workspaceId),
    tags: listTags(workspaceId),
    lastAccountId: lastTransaction?.contaId ?? null,
    lastCardId: lastTransaction?.cartaoId ?? null,
    recentDescriptions,
  };
}

/**
 * Saldo total das contas ao final de cada dia do mês, junto do saldo
 * anterior (tudo o que veio antes do primeiro dia do mês).
 * Query agregada única (sem N+1), sempre sem filtros.
 */
export function getMonthBalances(
  workspaceId: string,
  monthKey: string,
): {
  opening: number;
  byDay: Record<string, number>;
} {
  const { db, ws } = scopedDb(workspaceId);
  const { end } = monthRange(monthKey);
  const start = `${monthKey}-01`;

  const initialTotal =
    db
      .select({
        value: sql<number>`coalesce(sum(${accounts.saldoInicial}), 0)`,
      })
      .from(accounts)
      .where(and(ws(accounts.workspaceId), isNull(accounts.deletedAt)))
      .get()?.value ?? 0;

  const deltas = db
    .select({
      data: transactions.data,
      delta: sql<number>`coalesce(sum(case when ${transactions.tipo} = 'receita' then ${transactions.valor} when ${transactions.tipo} = 'despesa' then -${transactions.valor} when ${transactions.tipo} = 'transferencia' and ${transactions.cartaoDestinoId} is not null and ${transactions.pago} = 1 then -${transactions.valor} else 0 end), 0)`,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        isNull(transactions.cartaoId),
        lte(transactions.data, end),
      ),
    )
    .groupBy(transactions.data)
    .all();

  const opening = deltas
    .filter((row) => row.data < start)
    .reduce((sum, row) => sum + row.delta, initialTotal);

  const balances = computeDayBalancesFromDeltas(
    initialTotal,
    deltas,
    eachDayOfMonth(monthKey),
  );

  return { opening, byDay: Object.fromEntries(balances) };
}

export function getDayBalances(
  workspaceId: string,
  monthKey: string,
): Record<string, number> {
  return getMonthBalances(workspaceId, monthKey).byDay;
}

/**
 * Gera as ocorrências que faltam para as recorrências ativas.
 * A unique index (recorrencia_id, data) + ON CONFLICT DO NOTHING tornam a
 * operação idempotente, inclusive quando uma ocorrência foi soft-deleted.
 */
export function ensureRecurrencesForMonth(
  workspaceId: string,
  monthKey: string,
): void {
  const { db, ws } = scopedDb(workspaceId);
  const activeRecurrences = db
    .select()
    .from(recurrences)
    .where(
      and(
        ws(recurrences.workspaceId),
        eq(recurrences.ativo, true),
      ),
    )
    .all();

  if (activeRecurrences.length === 0) return;

  const horizon = recurrenceHorizon(monthKey, todayISO());
  const systemCategoryIds = getSystemCategoryIds(workspaceId);
  const accountIds = new Set(
    listAllAccounts(workspaceId)
      .filter((account) => !account.arquivada)
      .map((account) => account.id),
  );
  const cardIds = new Set(
    db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(
        and(
          ws(creditCards.workspaceId),
          isNull(creditCards.deletedAt),
          eq(creditCards.arquivado, false),
        ),
      )
      .all()
      .map((card) => card.id),
  );
  const categoryById = new Map(
    listAllCategories(workspaceId).map((category) => [category.id, category]),
  );
  const tagIds = new Set(listTags(workspaceId).map((tag) => tag.id));

  db.transaction((tx) => {
    for (const recurrence of activeRecurrences) {
      const template = recurrence.template as RecurrenceTemplate;

      if (template.cartaoId) {
        if (!cardIds.has(template.cartaoId)) continue;
      } else if (!template.contaId || !accountIds.has(template.contaId)) {
        continue;
      }
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
            workspaceId,
            tipo: template.tipo,
            descricao: template.descricao,
            valor: template.valor,
            data,
            pago: false,
            contaId: template.cartaoId ? null : template.contaId,
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
                workspaceId,
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
