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

/**
 * Fatura de uma compra: a coluna explícita importada (override) vence a
 * fatura calculada pela data e pelo fechamento do cartão.
 */
export function chaveDaFatura(
  movement: { data: string; faturaChaveOverride?: string | null },
  card: CardCycleConfig,
): string {
  return movement.faturaChaveOverride ?? faturaDaCompra(movement.data, card);
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

/**
 * Limite usado = saldo devedor líquido das faturas. Créditos de faturas
 * pagas a mais abatem o restante de outras faturas, em vez de ficarem presos
 * na fatura antiga. O resultado nunca fica negativo.
 */
export function calcularLimiteUsado(
  faturas: Array<
    Pick<CardInvoiceSummary, "restante"> & { credito?: number }
  >,
): number {
  const liquido = faturas.reduce(
    (sum, fatura) =>
      sum + Math.max(0, fatura.restante) - Math.max(0, fatura.credito ?? 0),
    0,
  );
  return Math.max(0, liquido);
}

export type CardDebtPurchase = {
  id: string;
  data: string;
  tipo: "despesa" | "receita";
  valor: number;
  faturaChave: string;
};

export type CardDebtSplit = {
  /** Fatura atual/em aberto: compras já feitas na fatura corrente ou anterior. */
  currentInvoice: number;
  /** Parcelas futuras de compras já feitas (faturas seguintes). */
  futureInstallments: number;
  /** Compras com data > referência (ainda não aconteceram). */
  futurePurchases: number;
  /** Dívida atual = fatura em aberto + parcelas futuras de compras feitas. */
  current: number;
  /** Compras futuras, fora da dívida atual. */
  future: number;
};

/**
 * Separa a dívida do cartão entre o que já é dívida na data de referência
 * (compras com data <= hoje) e compras futuras.
 *
 * Pagamentos já efetivados são alocados por FIFO dentro da fatura, na ordem
 * das compras. Assim, uma compra futura na mesma fatura não vira dívida atual
 * e um pagamento parcial não quita uma compra mais nova antes da mais antiga.
 *
 * `currentInvoiceChave` identifica a fatura corrente; compras já feitas em
 * faturas seguintes são "parcelas futuras", mas continuam sendo dívida atual.
 */
export function splitCardDebt(
  purchases: CardDebtPurchase[],
  paidByInvoice: Map<string, number>,
  referenceDate: string,
  currentInvoiceChave?: string | null,
): CardDebtSplit {
  const byInvoice = new Map<string, CardDebtPurchase[]>();
  for (const purchase of purchases) {
    const bucket = byInvoice.get(purchase.faturaChave) ?? [];
    bucket.push(purchase);
    byInvoice.set(purchase.faturaChave, bucket);
  }

  let currentInvoice = 0;
  let futureInstallments = 0;
  let futurePurchases = 0;
  let creditCarry = 0;

  const invoiceKeys = [...byInvoice.keys()].sort((a, b) => a.localeCompare(b));
  for (const invoice of invoiceKeys) {
    const items = byInvoice.get(invoice) ?? [];
    const ordered = [...items].sort(
      (a, b) => a.data.localeCompare(b.data) || a.id.localeCompare(b.id),
    );
    const remaining = ordered.map((item) =>
      item.tipo === "despesa" ? item.valor : -item.valor,
    );
    let available =
      Math.max(0, paidByInvoice.get(invoice) ?? 0) + creditCarry;

    // Estornos abatem primeiro as compras mais antigas da fatura.
    for (let index = 0; index < remaining.length; index += 1) {
      const value = remaining[index] ?? 0;
      if (value >= 0) continue;
      let credit = -value;
      remaining[index] = 0;
      for (let target = 0; target < remaining.length && credit > 0; target += 1) {
        const targetValue = remaining[target] ?? 0;
        if (target === index || targetValue <= 0) continue;
        const applied = Math.min(targetValue, credit);
        remaining[target] = targetValue - applied;
        credit -= applied;
      }
    }

    for (let index = 0; index < remaining.length && available > 0; index += 1) {
      const value = remaining[index] ?? 0;
      if (value <= 0) continue;
      const applied = Math.min(value, available);
      remaining[index] = value - applied;
      available -= applied;
    }

    // Pagamento que sobrou nesta fatura vira crédito para as próximas.
    creditCarry = Math.max(0, available);

    for (let index = 0; index < ordered.length; index += 1) {
      const item = ordered[index] as CardDebtPurchase;
      const value = remaining[index] ?? 0;
      if (value === 0) continue;
      if (item.data > referenceDate) {
        futurePurchases += value;
      } else if (currentInvoiceChave && invoice > currentInvoiceChave) {
        futureInstallments += value;
      } else {
        currentInvoice += value;
      }
    }
  }

  return {
    currentInvoice,
    futureInstallments,
    futurePurchases,
    current: currentInvoice + futureInstallments,
    future: futurePurchases,
  };
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
