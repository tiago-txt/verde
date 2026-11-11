import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listTransactionsForExport } from "@/lib/db/queries/data-export";
import {
  formatCsvDate,
  formatCsvNumber,
  toCsv,
} from "@/lib/finance/csv";
import { exportRangeSchema } from "@/lib/validation/import";

export const dynamic = "force-dynamic";

const TYPE_LABELS = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
} as const;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const parsed = exportRangeSchema.safeParse({
    de: url.searchParams.get("de"),
    ate: url.searchParams.get("ate"),
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Período inválido" },
      { status: 400 },
    );
  }

  const transactions = listTransactionsForExport(
    parsed.data.de,
    parsed.data.ate,
  );
  const headers = [
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
    transaction.tags.join(" | "),
    transaction.observacao ?? "",
    transaction.parcelaAtual && transaction.parcelaTotal
      ? `${transaction.parcelaAtual}/${transaction.parcelaTotal}`
      : "",
  ]);

  const csv = toCsv(headers, rows);
  const filename = `verde-lancamentos-${parsed.data.de}_${parsed.data.ate}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
