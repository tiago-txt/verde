import type { MonthSummary } from "./summary";

export type FooterSummary = {
  entradas: number;
  saidas: number;
  realizado: number;
  entradasPrevistas: number;
  saidasPrevistas: number;
  totalPrevisto: number;
  /** Fechamento previsto vindo da projeção encadeada, quando disponível. */
  previstoProjetado: number | null;
  /** Diferença entre a projeção encadeada e o saldo anterior + mês atual. */
  carryProjetado: number;
  /** Saldo de tudo o que veio antes do mês (conta + lançamentos). */
  saldoAnterior: number;
  /** Fechamento realizado: saldo anterior + receitas pagas − saídas pagas. */
  saldo: number;
  /** Fechamento previsto: saldo anterior + entradas previstas − saídas previstas. */
  previsto: number;
};

type SummaryWithBreakdown = MonthSummary & {
  provisoesOrcamento?: number;
  sobrasOrcamento?: number;
  faturasCartao?: number;
  pagamentosFatura?: number;
};

export type FooterBreakdownItem = {
  id: string;
  label: string;
  value: number;
  href: string;
};

export type FooterBreakdown = {
  despesa: FooterBreakdownItem[];
  receita: FooterBreakdownItem[];
};

/**
 * Métricas do rodapé. As liberações de orçamento abatem das saídas
 * previstas (nunca somam em entradas), preservando a igualdade com o saldo
 * previsto já calculado pelo app. O saldo anterior entra apenas no
 * fechamento (saldo/previsto), não nas receitas do mês.
 */
export function buildFooterSummary(
  summary: SummaryWithBreakdown,
  saldoAnterior = 0,
  previstoProjetado?: number,
): FooterSummary {
  const sobras = summary.sobrasOrcamento ?? 0;
  const entradasPrevistas = summary.entradasPrevistas - sobras;
  const saidasPrevistas = summary.saidasPrevistas - sobras;
  const totalPrevisto = entradasPrevistas - saidasPrevistas;
  const basePrevisto = saldoAnterior + totalPrevisto;
  const previsto = previstoProjetado ?? basePrevisto;
  const carryProjetado = previsto - basePrevisto;

  return {
    entradas: summary.entradasPagas,
    saidas: summary.saidasPagas,
    realizado: summary.saldoRealizado,
    entradasPrevistas,
    saidasPrevistas,
    totalPrevisto,
    previstoProjetado: previstoProjetado ?? null,
    carryProjetado,
    saldoAnterior,
    saldo: saldoAnterior + summary.saldoRealizado,
    previsto,
  };
}

/**
 * "De onde vem este número": cada componente que soma exatamente o valor
 * exibido em receita/despesa prevista no rodapé.
 *
 * `pagamentosFatura` separa transferências de pagamento das despesas comuns
 * (ambas já estão em `saidasPagas`/`saidasPrevistas`). As liberações de
 * orçamento aparecem como abatimento, igual ao `buildFooterSummary`.
 */
export function buildFooterBreakdown(
  summary: SummaryWithBreakdown,
  saldoAnterior = 0,
  previstoProjetado?: number,
): FooterBreakdown {
  const sobras = summary.sobrasOrcamento ?? 0;
  const pagamentosFatura = summary.pagamentosFatura ?? 0;
  const entradasPrevistas = summary.entradasPrevistas - sobras;
  const saidasPrevistas = summary.saidasPrevistas - sobras;
  const basePrevisto =
    saldoAnterior + entradasPrevistas - saidasPrevistas;
  const carry = previstoProjetado === undefined ? 0 : previstoProjetado - basePrevisto;

  const despesa: FooterBreakdownItem[] = [
    {
      id: "despesas-pagas",
      label: "Lançamentos pagos",
      value: summary.saidasPagas - pagamentosFatura,
      href: "/lancamentos?status=pagos",
    },
    {
      id: "despesas-a-pagar",
      label: "Lançamentos a pagar",
      value:
        summary.saidasPrevistas -
        summary.saidasPagas -
        (summary.faturasCartao ?? 0) -
        (summary.provisoesOrcamento ?? 0),
      href: "/lancamentos?status=nao_pagos",
    },
    {
      id: "pagamentos-fatura",
      label: "Pagamentos de fatura",
      value: pagamentosFatura,
      href: "/lancamentos?tipo=transferencia",
    },
    {
      id: "faturas-restantes",
      label: "Faturas restantes",
      value: summary.faturasCartao ?? 0,
      href: "/cartoes",
    },
    {
      id: "reservas",
      label: "Reservas de orçamento",
      value: summary.provisoesOrcamento ?? 0,
      href: "/limite-de-gastos",
    },
    {
      id: "liberacoes",
      label: "Liberações de orçamento",
      value: -sobras,
      href: "/limite-de-gastos",
    },
  ];
  const receita: FooterBreakdownItem[] = [
    {
      id: "receitas-pagas",
      label: "Receitas pagas",
      value: summary.entradasPagas,
      href: "/lancamentos?status=pagos",
    },
    {
      id: "receitas-a-receber",
      label: "Receitas a receber",
      value: summary.entradasPrevistas - summary.entradasPagas,
      href: "/lancamentos?status=nao_pagos",
    },
    {
      id: "liberacoes",
      label: "Liberações de orçamento",
      value: -sobras,
      href: "/limite-de-gastos",
    },
  ];

  if (carry < 0) {
    despesa.push({
      id: "projecao-acumulada",
      label: "Em aberto de meses anteriores",
      value: -carry,
      href: "/lancamentos?status=nao_pagos",
    });
  } else if (carry > 0) {
    receita.push({
      id: "projecao-acumulada",
      label: "Projeção acumulada de meses anteriores",
      value: carry,
      href: "/lancamentos?status=nao_pagos",
    });
  }

  return { despesa, receita };
}
