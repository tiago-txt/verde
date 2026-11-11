import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { DataSettings } from "@/components/settings/data-settings";
import { requireUser } from "@/lib/auth/current-user";
import { getLatestImportBatch } from "@/lib/db/queries/data-export";

export const metadata: Metadata = { title: "Dados" };

export default async function DadosPage() {
  await requireUser();
  const latestImport = getLatestImportBatch();

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
    </div>
  );
}
