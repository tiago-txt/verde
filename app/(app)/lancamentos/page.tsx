import type { Metadata } from "next";
import { TransactionsPageClient } from "@/components/transactions/transactions-page-client";
import { requireUser } from "@/lib/auth/current-user";
import { currentMonth, isValidMonthKey } from "@/lib/dates";
import {
  ensureRecurrencesForMonth,
  getTransactionFormData,
  listMonthTransactions,
} from "@/lib/db/queries/transactions";
import { summarizeTransactions } from "@/lib/finance/summary";

export const metadata: Metadata = { title: "Lançamentos" };

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; novo?: string }>;
}) {
  await requireUser();

  const params = await searchParams;
  const month =
    params.mes && isValidMonthKey(params.mes) ? params.mes : currentMonth();

  ensureRecurrencesForMonth(month);

  const transactions = listMonthTransactions(month);
  const formData = getTransactionFormData();
  const summary = summarizeTransactions(transactions);

  return (
    <TransactionsPageClient
      month={month}
      transactions={transactions}
      formData={formData}
      summary={summary}
      initialNew={params.novo === "1"}
    />
  );
}
