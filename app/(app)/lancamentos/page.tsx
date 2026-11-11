import type { Metadata } from "next";
import { TransactionsPageClient } from "@/components/transactions/transactions-page-client";
import { requireUser } from "@/lib/auth/current-user";
import {
  ensureRecurrencesForMonth,
  getDayBalances,
  getTransactionDetail,
  getTransactionFormData,
  listMonthTransactions,
} from "@/lib/db/queries/transactions";
import { todayISO } from "@/lib/dates";
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
  const dayBalances = getDayBalances(filters.mes);
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
      formData={formData}
      detail={detail}
      dayBalances={dayBalances}
      today={today}
      overdueIds={overdueIds}
      initialNew={params.novo === "1"}
    />
  );
}
