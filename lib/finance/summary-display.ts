import type { MonthSummary } from "./summary";

export type FooterSummary = {
  entradas: number;
  saidas: number;
  realizado: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  totalPrevisto: number;
};

/**
 * Seis métricas do rodapé. As liberações de orçamento abatem das saídas
 * previstas (nunca somam em entradas), preservando a igualdade com o saldo
 * previsto já calculado pelo app.
 */
export function buildFooterSummary(
  summary: MonthSummary & {
    provisoesOrcamento?: number;
    sobrasOrcamento?: number;
    faturasCartao?: number;
  },
): FooterSummary {
  const sobras = summary.sobrasOrcamento ?? 0;
  const entradasPrevistas = summary.entradasPrevistas - sobras;
  const saidasPrevistas = summary.saidasPrevistas - sobras;

  return {
    entradas: summary.entradasPagas,
    saidas: summary.saidasPagas,
    realizado: summary.saldoRealizado,
    entradasPrevistas,
    saidasPrevistas,
    totalPrevisto: entradasPrevistas - saidasPrevistas,
  };
}
