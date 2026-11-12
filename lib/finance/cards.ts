import { addDaysISO, addMonths, dateInMonth } from "@/lib/dates";
import {
  cicloDaData,
  dataDeFechamento,
  intervaloDoCiclo,
  type BudgetEvent,
} from "@/lib/finance/budgets";
import type { CardClosingBehavior } from "@/lib/db/schema";
import type { MonthSummary } from "@/lib/finance/summary";

/**
 * Regras puras de cartões de crédito e faturas.
 *
 * A fatura é identificada por `YYYY-MM` do vencimento. O ciclo de compras
 * começa no dia de fechamento do mês e termina no dia anterior ao fechamento
 * seguinte (mesma convenção dos orçamentos). Por padrão, compra feita NO dia
 * do fechamento entra na fatura seguinte; o cartão pode optar por entrar na
 * fatura atual.
 */

export type CardCycleConfig = {
  diaFechamento: number;
  diaVencimento: number;
  /** `proxima_fatura` (padrão) ou `fatura_atual` para compra no fechamento. */
  fechamentoCompra?: CardClosingBehavior;
};

export type CardInvoiceStatus = "aberta" | "fechada" | "parcial" | "paga";

export type CardInvoiceDates = {
  chave: string;
  inicio: string;
  fechamento: string;
  vencimento: string;
};

export type CardInvoiceSummary = CardInvoiceDates & {
  total: number;
  pago: number;
  restante: number;
  credito: number;
  status: CardInvoiceStatus;
  vencida: boolean;
};

export type CardMovement = {
  tipo: "despesa" | "receita";
  valor: number;
  data: string;
};

export type CardPayment = {
  valor: number;
  pago: boolean;
  faturaChave: string | null;
};

export type CardInvoiceFilters = {
  tipo: "despesa" | "receita" | "transferencia" | null;
  cartoes: string[];
  contas: string[];
  categorias: string[];
  tags: string[];
  status: "todos" | "pagos" | "nao_pagos";
  q: string | null;
};

const normalizarDia = (dia: number): number =>
  Math.min(31, Math.max(1, Math.trunc(Number.isFinite(dia) ? dia : 1)));

/** Mês de vencimento da fatura que recebe uma compra. */
export function faturaDaCompra(
  data: string,
  card: CardCycleConfig,
  fechamentoCompra: CardClosingBehavior = card.fechamentoCompra ??
    "proxima_fatura",
): string {
  let ciclo = cicloDaData(data, card.diaFechamento);
  const fechamentoDoMes = dateInMonth(
    data.slice(0, 7),
    normalizarDia(card.diaFechamento),
  );
  if (fechamentoCompra === "fatura_atual" && data === fechamentoDoMes) {
    ciclo = addMonths(ciclo, -1);
  }
  const mesFechamento = addMonths(ciclo, 1);
  return normalizarDia(card.diaVencimento) >
    normalizarDia(card.diaFechamento)
    ? mesFechamento
    : addMonths(mesFechamento, 1);
}

/** Datas completas (intervalo de compras, fechamento e vencimento). */
export function datasDaFatura(
  chave: string,
  card: CardCycleConfig,
): CardInvoiceDates {
  const diaFechamento = normalizarDia(card.diaFechamento);
  const diaVencimento = normalizarDia(card.diaVencimento);
  const mesFechamento =
    diaVencimento > diaFechamento ? chave : addMonths(chave, -1);
  const fechamento = dateInMonth(mesFechamento, diaFechamento);
  // Reaproveita a convenção de ciclo dos orçamentos.
  const ciclo = cicloDaData(addDaysISO(fechamento, -1), diaFechamento);
  const { inicio } = intervaloDoCiclo(ciclo, diaFechamento);

  return {
    chave,
    inicio,
    fechamento: dataDeFechamento(ciclo, diaFechamento),
    vencimento: dateInMonth(chave, diaVencimento),
  };
}

export function intervaloDaFatura(
  chave: string,
  card: CardCycleConfig,
): { inicio: string; fim: string } {
  const datas = datasDaFatura(chave, card);
  return { inicio: datas.inicio, fim: addDaysISO(datas.fechamento, -1) };
}

/** Data de fechamento da fatura. */
export function fechamentoDaFatura(
  chave: string,
  card: CardCycleConfig,
): string {
  return datasDaFatura(chave, card).fechamento;
}

export function totalDaFatura(movimentos: CardMovement[]): number {
  return movimentos.reduce(
    (total, movimento) =>
      movimento.tipo === "despesa"
        ? total + movimento.valor
        : total - movimento.valor,
    0,
  );
}

export type CardInvoiceStatusResult = {
  status: CardInvoiceStatus;
  vencida: boolean;
  restante: number;
  credito: number;
};

export function statusDaFatura(input: {
  total: number;
  pago: number;
  fechamento: string;
  vencimento: string;
  hoje: string;
}): CardInvoiceStatusResult {
  const restante = Math.max(0, input.total - input.pago);
  const credito = Math.max(0, input.pago - input.total);

  let status: CardInvoiceStatus;
  if (input.total > 0 && input.pago >= input.total) {
    status = "paga";
  } else if (input.pago > 0 && input.pago < input.total) {
    status = "parcial";
  } else if (input.hoje < input.fechamento) {
    status = "aberta";
  } else {
    status = "fechada";
  }

  return {
    status,
    vencida: restante > 0 && input.hoje > input.vencimento,
    restante,
    credito,
  };
}

export function resumirFatura(input: {
  chave: string;
  card: CardCycleConfig;
  movimentos: CardMovement[];
  pagamentos: CardPayment[];
  hoje: string;
}): CardInvoiceSummary {
  const total = totalDaFatura(input.movimentos);
  const pago = input.pagamentos
    .filter((pagamento) => pagamento.faturaChave === input.chave)
    .filter((pagamento) => pagamento.pago)
    .reduce((sum, pagamento) => sum + pagamento.valor, 0);

  return montarResumoFatura(input.chave, input.card, total, pago, input.hoje);
}

export function montarResumoFatura(
  chave: string,
  card: CardCycleConfig,
  total: number,
  pago: number,
  hoje: string,
): CardInvoiceSummary {
  const datas = datasDaFatura(chave, card);
  const status = statusDaFatura({
    total,
    pago,
    fechamento: datas.fechamento,
    vencimento: datas.vencimento,
    hoje,
  });

  return {
    ...datas,
    total,
    pago,
    restante: status.restante,
    credito: status.credito,
    status: status.status,
    vencida: status.vencida,
  };
}

/** Soma dos saldos devedores de todas as faturas (inclui futuras parcelas). */
export function calcularLimiteUsado(
  faturas: Pick<CardInvoiceSummary, "restante">[],
): number {
  return faturas.reduce((sum, fatura) => sum + Math.max(0, fatura.restante), 0);
}

export function limiteDisponivel(limite: number, usado: number): number {
  return limite - usado;
}

/** Evento virtual da fatura (somente o que ainda falta pagar). */
export function eventoDaFatura(
  fatura: CardInvoiceSummary,
): BudgetEvent | null {
  if (fatura.restante <= 0) return null;
  return {
    tipo: "provisao",
    data: fatura.vencimento,
    valor: fatura.restante,
    ciclo: fatura.chave,
  };
}

export type MonthSummaryWithCardInvoices = MonthSummary & {
  faturasCartao: number;
  faturasCartaoCount: number;
  pagamentosFatura: number;
};

/**
 * Faturas virtuais entram como saída prevista no mês do vencimento. O
 * realizado já recebe os pagamentos efetivos pelas transferências.
 */
export function aplicarFaturasAoResumo<T extends MonthSummary>(
  summary: T,
  faturas: Pick<CardInvoiceSummary, "restante" | "pago">[],
): T & {
  faturasCartao: number;
  faturasCartaoCount: number;
  pagamentosFatura: number;
} {
  const total = faturas.reduce(
    (sum, fatura) => sum + Math.max(0, fatura.restante),
    0,
  );
  const pagamentos = faturas.reduce((sum, fatura) => sum + fatura.pago, 0);

  return {
    ...summary,
    saidasPrevistas: summary.saidasPrevistas + total,
    saldoPrevisto: summary.saldoPrevisto - total,
    faturasCartao: total,
    faturasCartaoCount: faturas.filter((fatura) => fatura.restante > 0).length,
    pagamentosFatura: pagamentos,
  };
}

export function faturaPassaFiltros(
  fatura: Pick<CardInvoiceSummary, "restante" | "total" | "pago"> & {
    cartaoId: string;
    cartaoNome: string;
    contaPagamentoId: string | null;
  },
  filters: CardInvoiceFilters,
): boolean {
  // Fatura sem valor e sem pagamento não existe para a tela. Fatura quitada
  // continua visível (restante 0), mas não entra em cálculos de previsto.
  if (fatura.total <= 0 && fatura.pago <= 0) return false;
  if (filters.status !== "todos") return false;
  if (filters.tags.length > 0) return false;
  if (filters.categorias.length > 0) return false;
  if (filters.tipo && filters.tipo !== "despesa") return false;

  if (filters.cartoes.length > 0 && !filters.cartoes.includes(fatura.cartaoId)) {
    return false;
  }

  if (filters.contas.length > 0) {
    if (
      !fatura.contaPagamentoId ||
      !filters.contas.includes(fatura.contaPagamentoId)
    ) {
      return false;
    }
  }

  const query = filters.q?.trim().toLowerCase();
  if (query && !fatura.cartaoNome.toLowerCase().includes(query)) return false;

  return true;
}
