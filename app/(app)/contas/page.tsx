import type { Metadata } from "next";
import { AccountsView } from "@/components/accounts/accounts-view";
import { requireUser } from "@/lib/auth/current-user";
import { listAccountsWithBalances } from "@/lib/db/queries/accounts";

export const metadata: Metadata = { title: "Contas" };

export default async function ContasPage() {
  const user = await requireUser();
  const accounts = listAccountsWithBalances(user.workspaceId);

  return <AccountsView accounts={accounts} />;
}
