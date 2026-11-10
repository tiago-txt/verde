import type { TransactionType } from "@/lib/db/schema";

export type BalanceMode = "atual" | "previsto";

export type BalanceTransaction = {
  tipo: TransactionType;
  valor: number;
  pago: boolean;
  contaId: string | null;
  contaDestinoId: string | null;
  cartaoId: string | null;
  deletedAt?: Date | number | null;
};

export type BalanceAccount = {
  id: string;
  saldoInicial: number;
};

/**
 * Compras no cartão não movimentam a conta até a fatura ser paga (transferência).
 * Lançamentos excluídos/arquivados não entram em nenhum dos saldos.
 */
export function isBalanceRelevant(
  transaction: BalanceTransaction,
  mode: BalanceMode,
): boolean {
  if (transaction.deletedAt) return false;
  if (transaction.cartaoId) return false;
  if (mode === "atual" && !transaction.pago) return false;
  return true;
}

export function applyTransactionToBalances(
  balances: Map<string, number>,
  transaction: BalanceTransaction,
  mode: BalanceMode,
): void {
  if (!isBalanceRelevant(transaction, mode)) return;

  const { valor } = transaction;

  switch (transaction.tipo) {
    case "receita":
      if (transaction.contaId) {
        balances.set(
          transaction.contaId,
          (balances.get(transaction.contaId) ?? 0) + valor,
        );
      }
      break;

    case "despesa":
      if (transaction.contaId) {
        balances.set(
          transaction.contaId,
          (balances.get(transaction.contaId) ?? 0) - valor,
        );
      }
      break;

    case "transferencia":
      if (transaction.contaId) {
        balances.set(
          transaction.contaId,
          (balances.get(transaction.contaId) ?? 0) - valor,
        );
      }
      if (transaction.contaDestinoId) {
        balances.set(
          transaction.contaDestinoId,
          (balances.get(transaction.contaDestinoId) ?? 0) + valor,
        );
      }
      break;
  }
}

export function computeAccountBalances(
  accounts: BalanceAccount[],
  transactions: BalanceTransaction[],
  mode: BalanceMode,
): Map<string, number> {
  const balances = new Map(
    accounts.map((account) => [account.id, account.saldoInicial]),
  );

  for (const transaction of transactions) {
    applyTransactionToBalances(balances, transaction, mode);
  }

  return balances;
}

export function computeAccountBalance(
  account: BalanceAccount,
  transactions: BalanceTransaction[],
  mode: BalanceMode,
): number {
  return computeAccountBalances([account], transactions, mode).get(account.id) ?? 0;
}
