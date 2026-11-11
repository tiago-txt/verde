import type { TransactionType } from "@/lib/db/schema";

export type BatchTransaction = {
  id: string;
  tipo: TransactionType;
  pago: boolean;
  categoriaId: string | null;
};

/** IDs selecionados que devem receber o novo status de pagamento. */
export function idsForPaidChange(
  transactions: BatchTransaction[],
  pago: boolean,
): string[] {
  return transactions
    .filter((transaction) => transaction.pago !== pago)
    .map((transaction) => transaction.id);
}

/**
 * Só despesas recebem categoria de despesa e só receitas recebem categoria de
 * receita. Transferências (e o tipo oposto) são ignoradas.
 */
export function idsForCategoryChange(
  transactions: BatchTransaction[],
  categoryType: "despesa" | "receita",
): { applicable: string[]; ignored: string[] } {
  const applicable: string[] = [];
  const ignored: string[] = [];

  for (const transaction of transactions) {
    if (transaction.tipo === categoryType) applicable.push(transaction.id);
    else ignored.push(transaction.id);
  }

  return { applicable, ignored };
}

/**
 * Exclusão em lote nunca expande para a série inteira: apenas os IDs
 * selecionados são afetados.
 */
export function idsForBatchDelete(
  transactions: BatchTransaction[],
  selectedIds: string[],
): string[] {
  const existing = new Set(transactions.map((transaction) => transaction.id));
  return selectedIds.filter((id) => existing.has(id));
}
