import type { Metadata } from "next";
import { AccountsView } from "@/components/accounts/accounts-view";
import { requireUser } from "@/lib/auth/current-user";
import { listAccountsWithBalances } from "@/lib/db/queries/accounts";

export const metadata: Metadata = { title: "Contas" };

export default async function ContasPage() {
  await requireUser();
  const accounts = listAccountsWithBalances();

  return <AccountsView accounts={accounts} />;
}
