import {
  CARD_BASES,
  type CardBasis,
  type TransactionType,
} from "@/lib/db/schema";
import { addMonths } from "@/lib/dates";

/**
 * Base de reconhecimento das compras no cartão.
 *
 * - `caixa`: a compra vira dívida; a despesa aparece quando a fatura é paga.
 * - `competencia`: a compra é a despesa na data da compra; o pagamento da
 *   fatura é apenas transferência.
 */
export { CARD_BASES };
export type { CardBasis };
export const DEFAULT_CARD_BASIS: CardBasis = "caixa";

export const CARD_BASIS_LABELS: Record<CardBasis, string> = {
  caixa: "Caixa",
  competencia: "Competência",
};

export const CARD_BASIS_HELP: Record<CardBasis, string> = {
  caixa:
    "A compra no cartão vira dívida; a despesa aparece quando você paga a fatura.",
  competencia:
    "A compra no cartão é a despesa na data da compra; o pagamento da fatura é apenas transferência.",
};

export function normalizeCardBasis(value: unknown): CardBasis {
  return value === "competencia" ? "competencia" : "caixa";
}

/** Dados mínimos para classificar um lançamento em resultado. */
export type ResultTransaction = {
  tipo: TransactionType;
  valor: number;
  data: string;
  pago: boolean;
  cartaoId: string | null;
  cartaoDestinoId?: string | null;
  faturaChave?: string | null;
};

/** Transferência de uma conta própria para pagar fatura de cartão. */
export function isInvoicePayment(transaction: ResultTransaction): boolean {
  return (
    transaction.tipo === "transferencia" &&
    Boolean(transaction.cartaoDestinoId)
  );
}

/** Compra/estorno lançado no cartão (não movimenta conta). */
export function isCardPurchase(transaction: ResultTransaction): boolean {
  return Boolean(transaction.cartaoId);
}

export type ResultBreakdownItem = {
  id: string;
  label: string;
  value: number;
  href: string;
};

export type ResultSummary = {
  basis: CardBasis;
  receitas: number;
  despesas: number;
  saldo: number;
  /** Receitas efetivamente recebidas em conta (sempre por caixa). */
  receitasPagas: number;
  /** Despesas efetivamente pagas em conta + pagamentos de fatura. */
  despesasPagas: number;
  pagamentosFatura: number;
  /** Compras no cartão reconhecidas por competência (despesas − estornos). */
  comprasCartao: number;
  /** Componentes que somam exatamente receitas e despesas exibidas. */
  breakdown: {
    receita: ResultBreakdownItem[];
    despesa: ResultBreakdownItem[];
  };
};

function isRevenue(transaction: ResultTransaction): boolean {
  return transaction.tipo === "receita";
}

function isExpense(transaction: ResultTransaction): boolean {
  return transaction.tipo === "despesa";
}

/**
 * Resultado do mês segundo a preferência do usuário.
 *
 * Regras canônicas:
 * - transferências entre contas próprias são neutras;
 * - compra no cartão não entra no caixa;
 * - pagamento de fatura é saída de caixa, mas transferência na competência;
 * - na competência, compras no cartão contam na data da compra.
 */
export function summarizeResult(
  transactions: ResultTransaction[],
  basis: CardBasis,
): ResultSummary {
  let receitas = 0;
  let despesasConta = 0;
  let despesasCartao = 0;
  let receitasPagas = 0;
  let despesasPagasConta = 0;
  let pagamentosFatura = 0;

  for (const transaction of transactions) {
    if (isCardPurchase(transaction)) {
      if (basis !== "competencia") continue;
      // Estornos no cartão reduzem a despesa da categoria.
      if (isExpense(transaction)) despesasCartao += transaction.valor;
      else if (isRevenue(transaction)) despesasCartao -= transaction.valor;
      continue;
    }

    if (isInvoicePayment(transaction)) {
      // Pagamento de fatura é saída de caixa; na competência é transferência.
      if (transaction.pago) pagamentosFatura += transaction.valor;
      continue;
    }

    if (transaction.tipo === "transferencia") continue;

    if (isRevenue(transaction)) {
      if (transaction.pago) receitasPagas += transaction.valor;
      if (basis === "caixa") {
        if (transaction.pago) receitas += transaction.valor;
      } else {
        receitas += transaction.valor;
      }
    } else if (isExpense(transaction)) {
      if (transaction.pago) despesasPagasConta += transaction.valor;
      if (basis === "caixa") {
        if (transaction.pago) despesasConta += transaction.valor;
      } else {
        despesasConta += transaction.valor;
      }
    }
  }

  const despesas =
    basis === "caixa"
      ? despesasConta + pagamentosFatura
      : despesasConta + despesasCartao;

  const receitaItems: ResultBreakdownItem[] =
    basis === "caixa"
      ? [
          {
            id: "receitas-caixa",
            label: "Receitas recebidas em conta",
            value: receitas,
            href: "/lancamentos?tipo=receita&status=pagos",
          },
        ]
      : [
          {
            id: "receitas-conta",
            label: "Receitas de conta",
            value: receitas,
            href: "/lancamentos?tipo=receita",
          },
        ];

  const despesaItems: ResultBreakdownItem[] =
    basis === "caixa"
      ? [
          {
            id: "despesas-caixa",
            label: "Despesas pagas em conta",
            value: despesasConta,
            href: "/lancamentos?tipo=despesa&status=pagos",
          },
          {
            id: "pagamentos-fatura",
            label: "Pagamentos de fatura",
            value: pagamentosFatura,
            href: "/lancamentos?tipo=transferencia",
          },
        ]
      : [
          {
            id: "despesas-conta",
            label: "Despesas de conta",
            value: despesasConta,
            href: "/lancamentos?tipo=despesa",
          },
          {
            id: "compras-cartao",
            label: "Compras no cartão",
            value: despesasCartao,
            href: "/lancamentos?comprasCartao=1",
          },
        ];

  return {
    basis,
    receitas,
    despesas,
    saldo: receitas - despesas,
    receitasPagas,
    despesasPagas: despesasPagasConta + pagamentosFatura,
    pagamentosFatura,
    comprasCartao: despesasCartao,
    breakdown: {
      receita: receitaItems,
      despesa: despesaItems,
    },
  };
}

export type ResultMonthPoint = {
  mes: string;
  receitas: number;
  despesas: number;
  saldo: number;
};

function monthKeysBetween(from: string, to: string): string[] {
  const months: string[] = [];
  const end = to.slice(0, 7);
  let cursor = from.slice(0, 7);
  for (let i = 0; i < 240 && cursor <= end; i += 1) {
    months.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return months;
}

/** Série mensal de resultado na base escolhida. */
export function buildMonthlyResultSeries(
  transactions: ResultTransaction[],
  range: { from: string; to: string },
  basis: CardBasis,
): ResultMonthPoint[] {
  const months = monthKeysBetween(range.from, range.to);
  const grouped = new Map<string, ResultTransaction[]>(
    months.map((month) => [month, []]),
  );
  for (const transaction of transactions) {
    const bucket = grouped.get(transaction.data.slice(0, 7));
    if (bucket) bucket.push(transaction);
  }

  return months.map((mes) => {
    const summary = summarizeResult(grouped.get(mes) ?? [], basis);
    return {
      mes,
      receitas: summary.receitas,
      despesas: summary.despesas,
      saldo: summary.saldo,
    };
  });
}


