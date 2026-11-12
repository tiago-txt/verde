import { addMonths } from "@/lib/dates";
import type { TransactionType } from "@/lib/db/schema";
import { cicloDaData } from "./budgets";
import {
  datasDaFatura,
  faturaDaCompra,
  type CardCycleConfig,
} from "./cards";
import type { CardClosingBehavior } from "@/lib/db/schema";

/** Dados mínimos de um lançamento para resolver a competência do orçamento. */
export type CompetenceTransaction = {
  tipo: TransactionType;
  data: string;
  cartaoId: string | null;
  orcamentoDeslocamento?: number | null;
};

export type CompetenceCard = CardCycleConfig;

/** Snapshot da regra do cartão gravado no lançamento. */
export type CardSnapshot = {
  cartaoFechamento?: number | null;
  cartaoVencimento?: number | null;
  cartaoFechamentoCompra?: CardClosingBehavior | null;
};

/**
 * Prefere o snapshot do lançamento (ciclos encerrados não mudam quando o
 * cartão é reconfigurado). Sem snapshot, usa o cadastro atual.
 */
export function resolveCompetenceCard(
  snapshot: CardSnapshot,
  current?: CompetenceCard | null,
): CompetenceCard | null {
  if (snapshot.cartaoFechamento && snapshot.cartaoVencimento) {
    return {
      diaFechamento: snapshot.cartaoFechamento,
      diaVencimento: snapshot.cartaoVencimento,
      fechamentoCompra:
        snapshot.cartaoFechamentoCompra ??
        current?.fechamentoCompra ??
        "proxima_fatura",
    };
  }
  return current ?? null;
}

export const MIN_BUDGET_OFFSET = -2;
export const MAX_BUDGET_OFFSET = 2;

export function clampBudgetOffset(value: number | null | undefined): number {
  const n = Math.trunc(Number(value ?? 0));
  if (!Number.isFinite(n)) return 0;
  return Math.max(MIN_BUDGET_OFFSET, Math.min(MAX_BUDGET_OFFSET, n));
}

/** Data de saída do dinheiro: compra no cartão usa o vencimento da fatura. */
export function dataCompetencia(
  transaction: CompetenceTransaction,
  card?: CompetenceCard | null,
): string {
  if (transaction.cartaoId && transaction.tipo !== "transferencia" && card) {
    const chave = faturaDaCompra(
      transaction.data,
      card,
      card.fechamentoCompra,
    );
    return datasDaFatura(chave, card).vencimento;
  }
  return transaction.data;
}

/**
 * Ciclo de orçamento consumido: ciclo que contém a data de competência,
 * deslocado manualmente em ciclos relativos ao padrão.
 */
export function cicloCompetencia(
  transaction: CompetenceTransaction,
  diaFechamento: number,
  card?: CompetenceCard | null,
): string {
  const base = cicloDaData(
    dataCompetencia(transaction, card),
    diaFechamento,
  );
  return addMonths(base, clampBudgetOffset(transaction.orcamentoDeslocamento));
}

/** Fatura e vencimento de uma compra no cartão, quando aplicável. */
export function faturaDaTransacao(
  transaction: CompetenceTransaction,
  card?: CompetenceCard | null,
): { chave: string; vencimento: string } | null {
  if (!transaction.cartaoId || transaction.tipo === "transferencia" || !card) {
    return null;
  }
  const chave = faturaDaCompra(transaction.data, card, card.fechamentoCompra);
  return {
    chave,
    vencimento: datasDaFatura(chave, card).vencimento,
  };
}
