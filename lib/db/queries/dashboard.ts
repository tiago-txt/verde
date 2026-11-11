import { cache } from "react";
import { addDaysISO, monthRange, todayISO } from "@/lib/dates";
import { listCards, listCardInvoiceEventsForMonth } from "./cards";
import { listAccountsWithBalances } from "./accounts";
import {
  listReportRows,
  listUpcomingExpenses,
} from "./reports";
import type { ReportFilters } from "@/lib/finance/report-filters";
import {
  buildCategoryReport,
  buildMonthlySeries,
  buildTopCategories,
  evolutionRange,
  percentChange,
  rowsInRange,
  type DateRange,
  type MonthlyPoint,
  type ReportCategory,
  type TopCategory,
} from "@/lib/finance/reports";

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
  current: MonthlyPoint;
  previous: MonthlyPoint;
  categoryReport: ReturnType<typeof buildCategoryReport>;
  categories: TopCategory[];
  series6: MonthlyPoint[];
  series12: MonthlyPoint[];
  expenseVariation: number | null;
  incomeVariation: number | null;
};

export const getDashboardMonth = cache(
  async (workspaceId: string, month: string): Promise<DashboardMonthData> => {
    const range12 = evolutionRange(month, 12);
    const rows = listReportRows(workspaceId, reportFilters(month, range12));
    const series12 = buildMonthlySeries(rows, range12);
    const series6 = series12.slice(-6);
    const monthRangeValue = monthRange(month);
    const currentRange = { from: monthRangeValue.start, to: monthRangeValue.end };
    const previousMonthKey = addMonthsSafe(month, -1);
    const previousMonthRange = monthRange(previousMonthKey);
    const previousRangeValue = {
      from: previousMonthRange.start,
      to: previousMonthRange.end,
    };
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
    const currentRows = rowsInRange(rows, currentRange);
    const previousRows = rowsInRange(rows, previousRangeValue);

    return {
      month,
      current,
      previous: previousMonth,
      categoryReport: buildCategoryReport(currentRows, previousRows, "despesa"),
      categories: buildTopCategories(currentRows, "despesa", 6).items,
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

export const getDashboardBalance = cache(async (workspaceId: string) => {
  const accounts = listAccountsWithBalances(workspaceId);
  const cards = listCards(workspaceId);
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
  const cardDebt = cards.reduce((sum, card) => sum + card.limiteUsado, 0);

  return {
    operational,
    investments,
    cardDebt,
    accounts: accounts.filter(
      (account) => !account.deletedAt && !account.arquivada,
    ),
    cards,
  };
});

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
