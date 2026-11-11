import type { TransactionType } from "@/lib/db/schema";

export type DayBalanceTransaction = {
  tipo: TransactionType;
  valor: number;
  data: string;
  cartaoId: string | null;
  cartaoDestinoId?: string | null;
  pago?: boolean;
  deletedAt?: Date | number | null;
};

export type DayBalanceAccount = {
  saldoInicial: number;
};

export type DailyDelta = {
  data: string;
  delta: number;
};

/**
 * Aplica deltas diários acumulados. Recebe os dias exibidos em ordem
 * crescente e devolve o saldo ao final de cada dia.
 */
export function computeDayBalancesFromDeltas(
  initialTotal: number,
  deltas: DailyDelta[],
  days: string[],
): Map<string, number> {
  const sorted = [...deltas].sort((a, b) => a.data.localeCompare(b.data));
  const result = new Map<string, number>();
  let cumulative = initialTotal;
  let index = 0;

  for (const day of days) {
    while (index < sorted.length) {
      const current = sorted[index];
      if (!current || current.data > day) break;
      cumulative += current.delta;
      index += 1;
    }
    result.set(day, cumulative);
  }

  return result;
}

/**
 * Saldo total das contas ao final de cada dia.
 * Considera saldo inicial + receitas − despesas (pagas ou não), ignora
 * compras no cartão (só afetam a fatura) e transferências (cancelam no total).
 */
export function computeDayBalances(
  accounts: DayBalanceAccount[],
  transactions: DayBalanceTransaction[],
  days: string[],
): Map<string, number> {
  const initialTotal = accounts.reduce(
    (sum, account) => sum + account.saldoInicial,
    0,
  );
  const deltas = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.deletedAt || transaction.cartaoId) continue;

    let delta = 0;
    if (transaction.tipo === "receita") delta = transaction.valor;
    else if (transaction.tipo === "despesa") delta = -transaction.valor;
    else if (
      transaction.tipo === "transferencia" &&
      transaction.cartaoDestinoId &&
      transaction.pago
    ) {
      // Pagamento efetivo de fatura sai do total das contas (o destino é o
      // cartão, não outra conta).
      delta = -transaction.valor;
    }

    deltas.set(transaction.data, (deltas.get(transaction.data) ?? 0) + delta);
  }

  return computeDayBalancesFromDeltas(
    initialTotal,
    [...deltas.entries()].map(([data, delta]) => ({ data, delta })),
    days,
  );
}
