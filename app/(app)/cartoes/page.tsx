import type { Metadata } from "next";
import { CardsView } from "@/components/cards/cards-view";
import { requireUser } from "@/lib/auth/current-user";
import { listAllAccounts } from "@/lib/db/queries/accounts";
import { listCards } from "@/lib/db/queries/cards";

export const metadata: Metadata = { title: "Cartões" };

export default async function CartoesPage() {
  await requireUser();

  const cards = listCards();
  const accounts = listAllAccounts();

  return <CardsView cards={cards} accounts={accounts} />;
}
