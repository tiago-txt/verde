import { NextResponse } from "next/server";
import { getApiUser } from "@/lib/auth/current-user";
import { listMonthTransactions } from "@/lib/db/queries/transactions";
import { formatCsvDate, formatCsvNumber, toCsv } from "@/lib/finance/csv";
import { parseTransactionFilters } from "@/lib/finance/filters";

export const dynamic = "force-dynamic";

const TYPE_LABELS = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
} as const;

export async function GET(request: Request) {
  const user = await getApiUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const filters = parseTransactionFilters(
    Object.fromEntries(url.searchParams.entries()),
  );
  const transactions = listMonthTransactions(user.workspaceId, filters);

  const header = [
    "Data",
    "Tipo",
    "Descrição",
    "Valor (R$)",
    "Pago",
    "Conta/Cartão",
    "Destino",
    "Categoria",
    "Tags",
    "Observação",
    "Recorrente",
    "Parcela",
  ];

  const rows = transactions.map((transaction) => [
    formatCsvDate(transaction.data),
    TYPE_LABELS[transaction.tipo],
    transaction.descricao,
    formatCsvNumber(transaction.valor),
    transaction.pago ? "Sim" : "Não",
    transaction.contaNome ?? transaction.cartaoNome ?? "",
    transaction.contaDestinoNome ?? transaction.cartaoDestinoNome ?? "",
    transaction.categoriaNome ?? "Outros",
    transaction.tags.map((tag) => tag.nome).join(" | "),
    transaction.observacao ?? "",
    transaction.recorrenciaId ? "Sim" : "",
    transaction.parcelaGrupoId
      ? `${transaction.parcelaAtual}/${transaction.parcelaTotal}`
      : "",
  ]);

  const csv = toCsv(header, rows);
  const suffix = filters.de && filters.ate ? `${filters.de}_${filters.ate}` : filters.mes;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="verde-${suffix}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
