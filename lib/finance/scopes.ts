export type Scope = "single" | "future" | "all";

export type ScopedTransaction = {
  id: string;
  data: string;
  parcelaAtual: number | null;
};

/**
 * Escopo para lançamentos de uma recorrência fixa.
 * As transações recebidas devem pertencer à mesma recorrência.
 */
export function selectFixedRecurrenceTransactions(
  transactions: ScopedTransaction[],
  anchor: { id: string; data: string },
  scope: Scope,
): ScopedTransaction[] {
  switch (scope) {
    case "single":
      return transactions.filter((transaction) => transaction.id === anchor.id);
    case "future":
      return transactions.filter(
        (transaction) => transaction.data >= anchor.data,
      );
    case "all":
      return transactions;
  }
}

/**
 * Escopo para parcelas. "Este e os próximos" usa o número da parcela,
 * não a data, para não depender de eventuais ajustes de vencimento.
 */
export function selectInstallmentTransactions(
  transactions: ScopedTransaction[],
  anchor: { id: string; parcelaAtual: number },
  scope: Scope,
): ScopedTransaction[] {
  switch (scope) {
    case "single":
      return transactions.filter((transaction) => transaction.id === anchor.id);
    case "future":
      return transactions.filter(
        (transaction) => (transaction.parcelaAtual ?? 0) >= anchor.parcelaAtual,
      );
    case "all":
      return transactions;
  }
}
