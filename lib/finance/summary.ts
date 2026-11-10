import type { TransactionType } from "@/lib/db/schema";

export type SummaryTransaction = {
  tipo: TransactionType;
  valor: number;
  pago: boolean;
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
    if (transaction.tipo === "receita") {
      entradasPrevistas += transaction.valor;
      if (transaction.pago) entradasPagas += transaction.valor;
    } else if (transaction.tipo === "despesa") {
      saidasPrevistas += transaction.valor;
      if (transaction.pago) saidasPagas += transaction.valor;
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
