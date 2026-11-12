import {
  and,
  asc,
  eq,
  exists,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  categories,
  creditCards,
  tags,
  transactionTags,
  transactions,
} from "@/lib/db/schema";
import { addDaysISO, todayISO } from "@/lib/dates";
import { expandirCategorias } from "@/lib/finance/budgets";
import { faturaDaCompra } from "@/lib/finance/cards";
import type { ReportFilters } from "@/lib/finance/report-filters";
import {
  buildCategoryReport,
  buildMonthlyCategorySeries,
  buildMonthlySeries,
  buildOriginReport,
  buildTopCategories,
  filterReportRows,
  previousEquivalentRange,
  rowsInRange,
  type ReportRow,
} from "@/lib/finance/reports";
import { getCardInvoiceStatuses } from "./cards";
import { listAllCategories } from "./categories";

const parent = alias(categories, "parent_category");
const card = alias(creditCards, "report_card");

export type ReportBundle = ReturnType<typeof getReportData>;

function categoryFilterIds(
  workspaceId: string,
  categoriaIds: string[],
): string[] {
  if (categoriaIds.length === 0) return [];
  const all = listAllCategories(workspaceId).map((category) => ({
    id: category.id,
    categoriaPaiId: category.categoriaPaiId,
  }));
  return [...expandirCategorias(all, categoriaIds)];
}

/** Uma consulta de lançamentos para o intervalo; agregações são puras. */
export function listReportRows(
  workspaceId: string,
  filters: ReportFilters,
): ReportRow[] {
  const { db, ws } = scopedDb(workspaceId);
  const conditions = [
    ws(transactions.workspaceId),
    isNull(transactions.deletedAt),
    gte(transactions.data, filters.range.from),
    lte(transactions.data, filters.range.to),
    inArray(transactions.tipo, ["despesa", "receita"]),
  ];

  if (filters.contas.length > 0 || filters.cartoes.length > 0) {
    const origins = [];
    if (filters.contas.length > 0) {
      const accountFilter = inArray(transactions.contaId, filters.contas);
      if (accountFilter) origins.push(accountFilter);
    }
    if (filters.cartoes.length > 0) {
      const cardFilter = inArray(transactions.cartaoId, filters.cartoes);
      if (cardFilter) origins.push(cardFilter);
    }
    const origin = sql.join(origins, sql` or `);
    conditions.push(sql`(${origin})`);
  }

  const expandedCategories = categoryFilterIds(workspaceId, filters.categorias);
  if (expandedCategories.length > 0) {
    conditions.push(
      inArray(transactions.categoriaId, expandedCategories),
    );
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

  const rows = db
    .select({
      tipo: transactions.tipo,
      valor: transactions.valor,
      data: transactions.data,
      pago: transactions.pago,
      categoriaId: transactions.categoriaId,
      categoriaNome: categories.nome,
      categoriaPaiId: categories.categoriaPaiId,
      categoriaPaiNome: parent.nome,
      categoriaPaiIcone: parent.icone,
      categoriaPaiCor: parent.cor,
      categoriaIcone: categories.icone,
      categoriaCor: categories.cor,
      contaId: transactions.contaId,
      contaNome: accounts.nome,
      cartaoId: transactions.cartaoId,
      cartaoNome: card.nome,
      cartaoCor: card.cor,
      cartaoIcone: card.icone,
      cartaoDiaFechamento: card.diaFechamento,
      cartaoDiaVencimento: card.diaVencimento,
      cartaoFechamentoCompra: card.fechamentoCompra,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .leftJoin(parent, eq(categories.categoriaPaiId, parent.id))
    .leftJoin(accounts, eq(transactions.contaId, accounts.id))
    .leftJoin(card, eq(transactions.cartaoId, card.id))
    .where(and(...conditions))
    .orderBy(asc(transactions.data), asc(transactions.createdAt))
    .all();

  const statuses = getCardInvoiceStatuses(workspaceId);

  return rows.map((row) => {
    const faturaChave =
      row.cartaoId && row.cartaoDiaFechamento && row.cartaoDiaVencimento
        ? faturaDaCompra(row.data, {
            diaFechamento: row.cartaoDiaFechamento,
            diaVencimento: row.cartaoDiaVencimento,
            fechamentoCompra:
              row.cartaoFechamentoCompra ?? "proxima_fatura",
          })
        : null;
    const cardPaid =
      row.cartaoId && faturaChave
        ? statuses.get(`${row.cartaoId}:${faturaChave}`)?.status === "paga"
        : false;

    return {
      tipo: row.tipo,
      valor: row.valor,
      data: row.data,
      pago: row.cartaoId ? cardPaid : row.pago,
      categoriaId: row.categoriaId,
      categoriaNome: row.categoriaNome,
      categoriaPaiId: row.categoriaPaiId,
      categoriaPaiNome: row.categoriaPaiNome,
      categoriaPaiIcone: row.categoriaPaiIcone,
      categoriaPaiCor: row.categoriaPaiCor,
      categoriaIcone: row.categoriaIcone,
      categoriaCor: row.categoriaCor,
      contaId: row.contaId,
      contaNome: row.contaNome,
      cartaoId: row.cartaoId,
      cartaoNome: row.cartaoNome,
      cartaoCor: row.cartaoCor,
      cartaoIcone: row.cartaoIcone,
      faturaChave,
    } satisfies ReportRow;
  });
}

export function getReportData(
  workspaceId: string,
  filters: ReportFilters,
) {
  const previousRange = previousEquivalentRange(filters.range);
  const queryFilters: ReportFilters = {
    ...filters,
    range: {
      from:
        previousRange.from < filters.range.from
          ? previousRange.from
          : filters.range.from,
      to: filters.range.to,
    },
  };
  const allRows = listReportRows(workspaceId, queryFilters);
  const currentRows = filterReportRows(
    rowsInRange(allRows, filters.range),
    { onlyPaid: filters.onlyPaid },
  );
  const previousRows = filterReportRows(
    rowsInRange(allRows, previousRange),
    { onlyPaid: filters.onlyPaid },
  );

  const monthlySeries = buildMonthlySeries(currentRows, filters.range);
  const categoryReport = buildCategoryReport(
    currentRows,
    previousRows,
    filters.tipo,
  );
  const previousCategoryReport = buildCategoryReport(
    previousRows,
    [],
    filters.tipo,
  );

  const totals = monthlySeries.reduce(
    (acc, point) => ({
      receitas: acc.receitas + point.receitas,
      despesas: acc.despesas + point.despesas,
    }),
    { receitas: 0, despesas: 0 },
  );

  return {
    filters,
    previousRange,
    currentRows,
    previousRows,
    categoryReport,
    previousCategoryReport,
    topCategories: buildTopCategories(currentRows, filters.tipo, 6),
    monthlySeries,
    monthlyCategorySeries: buildMonthlyCategorySeries(
      currentRows,
      filters.range,
      filters.tipo,
      5,
    ),
    originReport: buildOriginReport(currentRows, filters.tipo),
    totals: {
      ...totals,
      saldo: totals.receitas - totals.despesas,
    },
  };
}

export type UpcomingExpense = {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  categoriaNome: string | null;
  categoriaCor: string | null;
  contaNome: string | null;
  daysUntil: number;
};

export function listUpcomingExpenses(
  workspaceId: string,
  days = 15,
): UpcomingExpense[] {
  const today = todayISO();
  const end = addDaysISO(today, days);
  const { db, ws } = scopedDb(workspaceId);
  const rows = db
    .select({
      id: transactions.id,
      descricao: transactions.descricao,
      valor: transactions.valor,
      data: transactions.data,
      categoriaNome: categories.nome,
      categoriaCor: categories.cor,
      contaNome: accounts.nome,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .leftJoin(accounts, eq(transactions.contaId, accounts.id))
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        isNull(transactions.cartaoId),
        eq(transactions.tipo, "despesa"),
        eq(transactions.pago, false),
        gte(transactions.data, today),
        lte(transactions.data, end),
      ),
    )
    .orderBy(asc(transactions.data), asc(transactions.createdAt))
    .limit(30)
    .all();

  return rows.map((row) => ({
    ...row,
    daysUntil: Math.round(
      (new Date(`${row.data}T12:00:00Z`).getTime() -
        new Date(`${today}T12:00:00Z`).getTime()) /
        86_400_000,
    ),
  }));
}

export function listCardsForDashboard(workspaceId: string) {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select({
      id: creditCards.id,
      nome: creditCards.nome,
      cor: creditCards.cor,
      icone: creditCards.icone,
      limite: creditCards.limite,
      diaFechamento: creditCards.diaFechamento,
      diaVencimento: creditCards.diaVencimento,
      arquivado: creditCards.arquivado,
    })
    .from(creditCards)
    .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
    .orderBy(asc(creditCards.arquivado), asc(creditCards.nome))
    .all();
}
