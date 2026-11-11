import type { Metadata } from "next";
import { TransactionsPageClient } from "@/components/transactions/transactions-page-client";
import { requireUser } from "@/lib/auth/current-user";
import {
  ensureRecurrencesForMonth,
  getMonthBalances,
  getTransactionDetail,
  getTransactionFormData,
  listMonthTransactions,
} from "@/lib/db/queries/transactions";
import { getBudgetEventsForMonth, getBudgetEventsForDayBalances } from "@/lib/db/queries/budgets";
import { listCardInvoiceEventsForMonth, listCardInvoiceEventsForDayBalances } from "@/lib/db/queries/cards";
import { todayISO } from "@/lib/dates";
import { aplicarEventosAoSalsoDia } from "@/lib/finance/budgets";
import { parseTransactionFilters } from "@/lib/finance/filters";

export const metadata: Metadata = { title: "Lançamentos" };

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const params = await searchParams;
  const filters = parseTransactionFilters(params);

  ensureRecurrencesForMonth(filters.mes);

  const transactions = listMonthTransactions(filters);
  const formData = getTransactionFormData();
  const customRange = Boolean(filters.de && filters.ate);
  const budgetEvents = customRange
    ? []
    : getBudgetEventsForMonth(filters.mes, filters);
  const cardInvoiceEvents = customRange
    ? []
    : listCardInvoiceEventsForMonth(filters.mes, filters);
  const monthBalances = getMonthBalances(filters.mes);
  const dayBalances = customRange
    ? {}
    : aplicarEventosAoSalsoDia(
        monthBalances.byDay,
        [
          ...getBudgetEventsForDayBalances(filters.mes),
          ...listCardInvoiceEventsForDayBalances(filters.mes).map((event) => ({
            tipo: "provisao" as const,
            data: event.vencimento,
            valor: event.restante,
            ciclo: event.faturaChave,
          })),
        ],
      );
  const detail = filters.detalhe
    ? getTransactionDetail(filters.detalhe)
    : null;
  const today = todayISO();
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
      openingBalance={monthBalances.opening}
      today={today}
      overdueIds={overdueIds}
      initialNew={params.novo === "1"}
    />
  );
}
