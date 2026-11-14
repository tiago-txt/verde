import { cache } from "react";
import { addDaysISO, monthRange, todayISO } from "@/lib/dates";
import {
  getCardDebtSnapshot,
  listCards,
  listCardInvoiceEventsForMonth,
} from "./cards";
import { listAccountsWithBalances } from "./accounts";
import {
  listReportRows,
  listResultRows,
  listUpcomingExpenses,
} from "./reports";
import type { ReportFilters } from "@/lib/finance/report-filters";
import {
  buildCategoryReport,
  buildTopCategories,
  evolutionRange,
  percentChange,
  rowsInRange,
  type DateRange,
  type MonthlyPoint,
  type ReportCategory,
  type TopCategory,
} from "@/lib/finance/reports";
import {
  buildMonthlyResultSeries,
  summarizeResult,
  type CardBasis,
  type ResultSummary,
} from "@/lib/finance/result";

function reportFilters(month: string, range: DateRange): ReportFilters {
  return {
    aba: "categoria",
    periodo: "mes",
    tipo: "despesa",
    mes: month,
    de: null,
    ate: null,
    contas: [],
    cartoes: [],
    categorias: [],
    tags: [],
    onlyPaid: false,
    range,
  };
}

export type DashboardMonthData = {
  month: string;
  basis: CardBasis;
  /** Resultado do mês na base escolhida pelo usuário. */
  result: ResultSummary;
  previousResult: ResultSummary;
  current: MonthlyPoint;
  previous: MonthlyPoint;
  categoryReport: ReturnType<typeof buildCategoryReport>;
  categories: TopCategory[];
  /** Gastos por categoria são sempre por competência (rótulo explícito). */
  categoryBasis: "competencia";
  series6: MonthlyPoint[];
  series12: MonthlyPoint[];
  expenseVariation: number | null;
  incomeVariation: number | null;
};

export const getDashboardMonth = cache(
  async (
    workspaceId: string,
    month: string,
    basis: CardBasis,
  ): Promise<DashboardMonthData> => {
    const range12 = evolutionRange(month, 12);
    const resultRows = listResultRows(workspaceId, range12);
    const series12 = buildMonthlyResultSeries(resultRows, range12, basis);
    const series6 = series12.slice(-6);
    const monthRangeValue = monthRange(month);
    const currentRange = { from: monthRangeValue.start, to: monthRangeValue.end };
    const previousMonthKey = addMonthsSafe(month, -1);
    const previousMonthRange = monthRange(previousMonthKey);
    const previousRangeValue = {
      from: previousMonthRange.start,
      to: previousMonthRange.end,
    };
    // Resultado por categoria permanece em competência (data da compra).
    const reportRows = listReportRows(workspaceId, reportFilters(month, range12));
    const previousMonth = series12.at(-2) ?? {
      mes: "",
      receitas: 0,
      despesas: 0,
      saldo: 0,
    };
    const current = series12.at(-1) ?? {
      mes: month,
      receitas: 0,
      despesas: 0,
      saldo: 0,
    };
    const currentReportRows = rowsInRange(reportRows, currentRange);
    const previousReportRows = rowsInRange(reportRows, previousRangeValue);
    const currentMonthRows = resultRows.filter(
      (row) => row.data >= currentRange.from && row.data <= currentRange.to,
    );
    const previousMonthRows = resultRows.filter(
      (row) => row.data >= previousRangeValue.from && row.data <= previousRangeValue.to,
    );

    return {
      month,
      basis,
      result: summarizeResult(currentMonthRows, basis),
      previousResult: summarizeResult(previousMonthRows, basis),
      current,
      previous: previousMonth,
      categoryReport: buildCategoryReport(
        currentReportRows,
        previousReportRows,
        "despesa",
      ),
      categories: buildTopCategories(currentReportRows, "despesa", 6).items,
      categoryBasis: "competencia",
      series6,
      series12,
      expenseVariation: percentChange(current.despesas, previousMonth.despesas),
      incomeVariation: percentChange(current.receitas, previousMonth.receitas),
    };
  },
);

function addMonthsSafe(month: string, delta: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2000, (monthNumber ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Saldo no escopo TOTAL (contas operacionais + investimentos) na data de
 * referência. Compras no cartão não entram no saldo das contas.
 */
export const getDashboardBalance = cache(
  async (workspaceId: string, asOf = todayISO()) => {
    const accounts = listAccountsWithBalances(workspaceId, {
      referenceDate: asOf,
    });
    const cards = listCards(workspaceId);
    const debt = getCardDebtSnapshot(workspaceId, asOf);
    const operational = accounts
      .filter(
        (account) =>
          !account.deletedAt &&
          account.tipo !== "investimento" &&
          !account.arquivada,
      )
      .reduce((sum, account) => sum + account.saldoAtual, 0);
    const investments = accounts
      .filter(
        (account) =>
          !account.deletedAt &&
          account.tipo === "investimento" &&
          !account.arquivada,
      )
      .reduce((sum, account) => sum + account.saldoAtual, 0);
    const total = operational + investments;

    return {
      asOf,
      total,
      operational,
      investments,
      currentCardDebt: debt.current,
      currentInvoiceDebt: debt.currentInvoice,
      futureInstallmentsDebt: debt.futureInstallments,
      futureCardDebt: debt.future,
      netWorth: total - debt.current,
      /** Compatibilidade: dívida atual (não inclui compras futuras). */
      cardDebt: debt.current,
      debt,
      accounts: accounts.filter(
        (account) => !account.deletedAt && !account.arquivada,
      ),
      cards,
    };
  },
);

export type UpcomingInvoice = ReturnType<
  typeof listCardInvoiceEventsForMonth
>[number];

export const getDashboardUpcoming = cache(async (workspaceId: string) => {
  const today = todayISO();
  const end = addDaysISO(today, 15);
  const month = today.slice(0, 7);
  const nextMonth = addDaysISO(`${month}-01`, 35).slice(0, 7);
  const empty = {
    tipo: null,
    cartoes: [],
    contas: [],
    categorias: [],
    tags: [],
    status: "todos" as const,
    q: null,
  };
  const invoices = [
    ...listCardInvoiceEventsForMonth(workspaceId, month, empty),
    ...listCardInvoiceEventsForMonth(workspaceId, nextMonth, empty),
  ]
    .filter(
      (invoice) =>
        invoice.restante > 0 &&
        invoice.vencimento >= today &&
        invoice.vencimento <= end,
    )
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  return {
    expenses: listUpcomingExpenses(workspaceId, 15),
    invoices,
  };
});

export const getDashboardCards = cache(async (workspaceId: string) =>
  listCards(workspaceId),
);
