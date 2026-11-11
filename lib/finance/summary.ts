import type { TransactionType } from "@/lib/db/schema";

export type SummaryTransaction = {
  tipo: TransactionType;
  valor: number;
  pago: boolean;
  cartaoId?: string | null;
  cartaoDestinoId?: string | null;
  faturaChave?: string | null;
};

export type MonthSummary = {
  entradasPagas: number;
  saidasPagas: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  saldoRealizado: number;
  saldoPrevisto: number;
};

/**
 * Resumo do mês. Transferências não entram em entradas/saídas; o saldo
 * realizado usa apenas lançamentos pagos e o previsto inclui todos.
 */
export function summarizeTransactions(
  transactions: SummaryTransaction[],
): MonthSummary {
  let entradasPagas = 0;
  let saidasPagas = 0;
  let entradasPrevistas = 0;
  let saidasPrevistas = 0;

  for (const transaction of transactions) {
    // Compras no cartão não entram no resumo: a saída é a fatura/pagamento.
    if (transaction.cartaoId) continue;

    if (transaction.tipo === "receita") {
      entradasPrevistas += transaction.valor;
      if (transaction.pago) entradasPagas += transaction.valor;
    } else if (transaction.tipo === "despesa") {
      saidasPrevistas += transaction.valor;
      if (transaction.pago) saidasPagas += transaction.valor;
    } else if (transaction.cartaoDestinoId && transaction.pago) {
      // Pagamento efetivo de fatura é saída da conta (não é despesa).
      saidasPrevistas += transaction.valor;
      saidasPagas += transaction.valor;
    }
  }

  return {
    entradasPagas,
    saidasPagas,
    entradasPrevistas,
    saidasPrevistas,
    saldoRealizado: entradasPagas - saidasPagas,
    saldoPrevisto: entradasPrevistas - saidasPrevistas,
  };
}
