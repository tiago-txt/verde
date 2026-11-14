import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DataSettings } from "@/components/settings/data-settings";
import {
  SpreadsheetImport,
  type SpreadsheetImportOptions,
} from "@/components/settings/spreadsheet-import";
import { requireUser } from "@/lib/auth/current-user";
import { listAllAccounts, listAccountTransactionCounts } from "@/lib/db/queries/accounts";
import { listCardsForFilter } from "@/lib/db/queries/cards";
import {
  listAllCategories,
  listTags,
} from "@/lib/db/queries/categories";
import { getLatestImportBatch } from "@/lib/db/queries/data-export";

export const metadata: Metadata = { title: "Dados" };

export default async function DadosPage() {
  const user = await requireUser();
  const latestImport = getLatestImportBatch(user.workspaceId);
  const accountCounts = listAccountTransactionCounts(user.workspaceId);

  const spreadsheetOptions: SpreadsheetImportOptions = {
    accounts: listAllAccounts(user.workspaceId).map((account) => ({
      id: account.id,
      nome: account.nome,
      arquivada: account.arquivada,
      hasTransactions:
        (accountCounts.get(account.id) ?? 0) > 0,
    })),
    cards: listCardsForFilter(user.workspaceId).map((card) => ({
      id: card.id,
      nome: card.nome,
      arquivado: card.arquivado,
      diaFechamento: card.diaFechamento,
      diaVencimento: card.diaVencimento,
    })),
    categories: listAllCategories(user.workspaceId)
      .filter((category) => !category.deletedAt)
      .map((category) => ({
        id: category.id,
        nome: category.nome,
        tipo: category.tipo,
      })),
    tags: listTags(user.workspaceId),
  };

  return (
    <div className="space-y-3">
      <Link
        href="/configuracoes"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Configurações
      </Link>
      <DataSettings latestImport={latestImport} />
      <SpreadsheetImport options={spreadsheetOptions} />
    </div>
  );
}
