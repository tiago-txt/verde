import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listMonthTransactions } from "@/lib/db/queries/transactions";
import { parseTransactionFilters } from "@/lib/finance/filters";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const TYPE_LABELS = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
} as const;

function cell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = parseTransactionFilters(
    Object.fromEntries(url.searchParams.entries()),
  );
  const transactions = listMonthTransactions(filters);

  const header = [
    "Data",
    "Tipo",
    "Descrição",
    "Categoria",
    "Conta",
    "Conta destino",
    "Valor (R$)",
    "Pago",
    "Tags",
    "Observação",
    "Recorrente",
    "Parcela",
  ];

  const rows = transactions.map((transaction) => [
    formatDate(transaction.data),
    TYPE_LABELS[transaction.tipo],
    transaction.descricao,
    transaction.categoriaNome ?? "Outros",
    transaction.contaNome ?? "",
    transaction.contaDestinoNome ?? "",
    (transaction.valor / 100).toFixed(2).replace(".", ","),
    transaction.pago ? "Sim" : "Não",
    transaction.tags.map((tag) => tag.nome).join(" | "),
    transaction.observacao ?? "",
    transaction.recorrenciaId ? "Sim" : "",
    transaction.parcelaGrupoId
      ? `${transaction.parcelaAtual}/${transaction.parcelaTotal}`
      : "",
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(cell).join(";"))
    .join("\r\n");

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="verde-${filters.mes}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
