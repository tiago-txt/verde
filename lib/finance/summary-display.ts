import type { MonthSummary } from "./summary";

export type FooterSummary = {
  entradas: number;
  saidas: number;
  realizado: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  totalPrevisto: number;
  /** Saldo de tudo o que veio antes do mês (conta + lançamentos). */
  saldoAnterior: number;
  /** Fechamento realizado: saldo anterior + receitas pagas − saídas pagas. */
  saldo: number;
  /** Fechamento previsto: saldo anterior + entradas previstas − saídas previstas. */
  previsto: number;
};

/**
 * Métricas do rodapé. As liberações de orçamento abatem das saídas
 * previstas (nunca somam em entradas), preservando a igualdade com o saldo
 * previsto já calculado pelo app. O saldo anterior entra apenas no
 * fechamento (saldo/previsto), não nas receitas do mês.
 */
export function buildFooterSummary(
  summary: MonthSummary & {
    provisoesOrcamento?: number;
    sobrasOrcamento?: number;
    faturasCartao?: number;
  },
  saldoAnterior = 0,
): FooterSummary {
  const sobras = summary.sobrasOrcamento ?? 0;
  const entradasPrevistas = summary.entradasPrevistas - sobras;
  const saidasPrevistas = summary.saidasPrevistas - sobras;
  const totalPrevisto = entradasPrevistas - saidasPrevistas;

  return {
    entradas: summary.entradasPagas,
    saidas: summary.saidasPagas,
    realizado: summary.saldoRealizado,
    entradasPrevistas,
    saidasPrevistas,
    totalPrevisto,
    saldoAnterior,
    saldo: saldoAnterior + summary.saldoRealizado,
    previsto: saldoAnterior + totalPrevisto,
  };
}
