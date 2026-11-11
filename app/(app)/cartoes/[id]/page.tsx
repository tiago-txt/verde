import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CardDetailView } from "@/components/cards/card-detail-view";
import { requireUser } from "@/lib/auth/current-user";
import { listAllAccounts } from "@/lib/db/queries/accounts";
import {
  getCardById,
  getCardInvoiceDetail,
} from "@/lib/db/queries/cards";
import { getTransactionFormData } from "@/lib/db/queries/transactions";
import { isValidMonthKey, todayISO } from "@/lib/dates";
import { faturaDaCompra } from "@/lib/finance/cards";
import { idSchema } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Fatura do cartão" };

export default async function CartaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const card = getCardById(user.workspaceId, id);
  if (!card) notFound();

  const query = await searchParams;
  const raw = Array.isArray(query.fatura) ? query.fatura[0] : query.fatura;
  const chave =
    raw && isValidMonthKey(raw)
      ? raw
      : faturaDaCompra(todayISO(), {
          diaFechamento: card.diaFechamento,
          diaVencimento: card.diaVencimento,
        });

  const detail = getCardInvoiceDetail(user.workspaceId, id, chave);
  if (!detail) notFound();

  const formData = getTransactionFormData(user.workspaceId);

  return (
    <CardDetailView
      detail={detail}
      formData={formData}
      accounts={listAllAccounts(user.workspaceId)}
    />
  );
}
