import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TransactionsPageClient } from "@/components/transactions/transactions-page-client";
import { requireUser } from "@/lib/auth/current-user";
import {
  ensureRecurrencesForMonth,
  getMonthBalances,
  getPendenciasAntesDoMes,
  getTransactionDetail,
  getTransactionFormData,
  listMonthTransactions,
} from "@/lib/db/queries/transactions";
import { getBudgetEventsForMonth, getBudgetEventsForDayBalances } from "@/lib/db/queries/budgets";
import { getForecastBanner } from "@/lib/db/queries/forecast";
import { listCardInvoiceEventsForMonth, listCardInvoiceEventsForDayBalances } from "@/lib/db/queries/cards";
import { getCardBasis } from "@/lib/db/queries/finance-preferences";
import { listResultRows } from "@/lib/db/queries/reports";
import { monthRange, todayISO } from "@/lib/dates";
import { aplicarEventosAoSalsoDia } from "@/lib/finance/budgets";
import { parseTransactionFilters } from "@/lib/finance/filters";
import { summarizeResult } from "@/lib/finance/result";

export const metadata: Metadata = { title: "Lançamentos" };

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const params = await searchParams;
  const filters = parseTransactionFilters(params);
  const workspaceId = user.workspaceId;

  ensureRecurrencesForMonth(workspaceId, filters.mes);

  const transactions = listMonthTransactions(workspaceId, filters);
  const formData = getTransactionFormData(workspaceId);
  const customRange = Boolean(filters.de && filters.ate);
  const pendenciasAnteriores = customRange
    ? { despesas: 0, receitas: 0, count: 0 }
    : getPendenciasAntesDoMes(workspaceId, filters.mes);
  const budgetEvents = customRange
    ? []
    : getBudgetEventsForMonth(workspaceId, filters.mes, filters, {
        mergeSobras: true,
      });
  const cardInvoiceEvents = customRange
    ? []
    : listCardInvoiceEventsForMonth(workspaceId, filters.mes, filters);
  const monthBalances = getMonthBalances(workspaceId, filters.mes, "previsto");
  const realizedBalances = getMonthBalances(
    workspaceId,
    filters.mes,
    "realizado",
  );
  // Mesma base de resultado em todas as telas (preferência do usuário).
  const cardBasis = getCardBasis(workspaceId, user.id);
  const monthWindow = monthRange(filters.mes);
  const resultRange = customRange
    ? { from: filters.de as string, to: filters.ate as string }
    : { from: monthWindow.start, to: monthWindow.end };
  const result = summarizeResult(
    listResultRows(workspaceId, resultRange),
    cardBasis,
  );
  const dayBalances = customRange
    ? {}
    : aplicarEventosAoSalsoDia(
        monthBalances.byDay,
        [
          ...getBudgetEventsForDayBalances(workspaceId, filters.mes),
          ...listCardInvoiceEventsForDayBalances(workspaceId, filters.mes).map((event) => ({
            tipo: "provisao" as const,
            data: event.vencimento,
            valor: event.restante,
            ciclo: event.faturaChave,
          })),
        ],
      );
  const detail = filters.detalhe
    ? getTransactionDetail(workspaceId, filters.detalhe)
    : null;
  if (filters.detalhe && !detail) notFound();
  const today = todayISO();
  const forecastAlert = getForecastBanner(workspaceId, user.id, filters.mes);
  const overdueIds = transactions
    .filter(
      (transaction) =>
        !transaction.pago && !transaction.cartaoId && transaction.data < today,
    )
    .map((transaction) => transaction.id);

  return (
    <TransactionsPageClient
      filters={filters}
      transactions={transactions}
      budgetEvents={budgetEvents}
      cardInvoiceEvents={cardInvoiceEvents}
      formData={formData}
      detail={detail}
      dayBalances={dayBalances}
      openingBalance={realizedBalances.opening}
      today={today}
      overdueIds={overdueIds}
      initialNew={params.novo === "1"}
      userId={user.id}
      forecastAlert={forecastAlert}
      cardBasis={cardBasis}
      result={result}
      dayBalanceMode={monthBalances.modo}
      pendenciasAnteriores={pendenciasAnteriores}
    />
  );
}
