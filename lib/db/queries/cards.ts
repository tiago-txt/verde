import { and, asc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  categories,
  creditCards,
  transactions,
  type CreditCard,
} from "@/lib/db/schema";
import { todayISO } from "@/lib/dates";
import { addDaysISO } from "@/lib/dates";
import {
  calcularLimiteUsado,
  datasDaFatura,
  faturaDaCompra,
  faturaPassaFiltros,
  limiteDisponivel,
  montarResumoFatura,
  type CardCycleConfig,
  type CardInvoiceFilters,
  type CardInvoiceSummary,
} from "@/lib/finance/cards";

export type CardAccountInfo = {
  id: string;
  nome: string;
  cor: string;
  icone: string;
  arquivada: boolean;
};

export type CardWithInvoice = CreditCard & {
  contaPagamentoNome: string | null;
  currentInvoice: CardInvoiceSummary;
  limiteUsado: number;
  disponivel: number;
  comprasCount: number;
};

export type CardOption = {
  id: string;
  nome: string;
  bandeira: string;
  cor: string;
  icone: string;
  arquivado: boolean;
  diaFechamento: number;
  diaVencimento: number;
  fechamentoCompra: "proxima_fatura" | "fatura_atual";
};

export type CardPurchaseItem = {
  id: string;
  tipo: "despesa" | "receita";
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  categoriaId: string | null;
  categoriaNome: string | null;
  categoriaCor: string | null;
  categoriaIcone: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  observacao: string | null;
};

export type CardPaymentItem = {
  id: string;
  valor: number;
  data: string;
  pago: boolean;
  contaId: string | null;
  contaNome: string | null;
  contaCor: string | null;
  contaIcone: string | null;
};

export type CardInvoiceDetail = {
  card: CreditCard & { contaPagamentoNome: string | null };
  fatura: CardInvoiceSummary;
  purchases: CardPurchaseItem[];
  payments: CardPaymentItem[];
  futureInvoices: CardInvoiceSummary[];
  limiteUsado: number;
  disponivel: number;
  currentInvoiceChave: string;
  contaPagamento: CardAccountInfo | null;
};

export type CardInvoicePayer = {
  contaId: string | null;
  contaNome: string | null;
  contaCor: string | null;
  contaIcone: string | null;
  valor: number;
};

export type CardInvoiceEvent = {
  id: string;
  cartaoId: string;
  cartaoNome: string;
  cartaoCor: string;
  cartaoIcone: string;
  contaPagamentoId: string | null;
  faturaChave: string;
  inicio: string;
  fechamento: string;
  vencimento: string;
  total: number;
  pago: number;
  restante: number;
  status: CardInvoiceSummary["status"];
  vencida: boolean;
  /** Contas que efetivamente pagaram esta fatura, da maior para a menor. */
  pagamentos: CardInvoicePayer[];
};

type MovementRow = {
  cartaoId: string | null;
  tipo: "despesa" | "receita" | "transferencia";
  valor: number;
  data: string;
};

type PaymentRow = {
  cartaoId: string | null;
  valor: number;
  pago: boolean;
  faturaChave: string | null;
  data: string;
  contaId: string | null;
  contaNome: string | null;
  contaCor: string | null;
  contaIcone: string | null;
};

function cardConfig(card: CreditCard): CardCycleConfig {
  return {
    diaFechamento: card.diaFechamento,
    diaVencimento: card.diaVencimento,
    fechamentoCompra: card.fechamentoCompra,
  };
}

function loadLedger(workspaceId: string): {
  movements: MovementRow[];
  payments: PaymentRow[];
} {
  const { db, ws } = scopedDb(workspaceId);
  const movements = db
    .select({
      cartaoId: transactions.cartaoId,
      tipo: transactions.tipo,
      valor: transactions.valor,
      data: transactions.data,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        isNotNull(transactions.cartaoId),
      ),
    )
    .all();

  const payments = db
    .select({
      cartaoId: transactions.cartaoDestinoId,
      valor: transactions.valor,
      pago: transactions.pago,
      faturaChave: transactions.faturaChave,
      data: transactions.data,
      contaId: accounts.id,
      contaNome: accounts.nome,
      contaCor: accounts.cor,
      contaIcone: accounts.icone,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.contaId, accounts.id))
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        isNotNull(transactions.cartaoDestinoId),
      ),
    )
    .all();

  return { movements, payments };
}

type InvoiceWithPayers = CardInvoiceSummary & {
  pagamentos: CardInvoicePayer[];
};

function invoicesForCard(
  card: CreditCard,
  movements: MovementRow[],
  payments: PaymentRow[],
  hoje: string,
  extraMovements: MovementRow[] = [],
): InvoiceWithPayers[] {
  const config = cardConfig(card);
  const buckets = new Map<
    string,
    { total: number; pago: number; pagadores: Map<string, CardInvoicePayer> }
  >();

  function bucket(key: string) {
    const current =
      buckets.get(key) ?? { total: 0, pago: 0, pagadores: new Map() };
    buckets.set(key, current);
    return current;
  }

  function registrarPagador(
    target: { pagadores: Map<string, CardInvoicePayer> },
    payment: PaymentRow,
    valor: number,
  ) {
    if (valor <= 0) return;
    const key = payment.contaId ?? "sem-conta";
    const current = target.pagadores.get(key) ?? {
      contaId: payment.contaId,
      contaNome: payment.contaNome,
      contaCor: payment.contaCor,
      contaIcone: payment.contaIcone,
      valor: 0,
    };
    current.valor += valor;
    target.pagadores.set(key, current);
  }

  for (const movement of [...movements, ...extraMovements]) {
    if (movement.cartaoId !== card.id) continue;
    if (movement.tipo === "transferencia") continue;
    const key = faturaDaCompra(movement.data, config);
    const target = bucket(key);
    target.total +=
      movement.tipo === "despesa" ? movement.valor : -movement.valor;
  }

  for (const payment of payments) {
    if (payment.cartaoId !== card.id || !payment.faturaChave) continue;
    const target = bucket(payment.faturaChave);
    if (payment.pago) {
      target.pago += payment.valor;
      registrarPagador(target, payment, payment.valor);
    }
  }

  // Pagamentos antigos/sem `fatura_chave` são transferências reais: aloca no
  // FIFO das faturas ainda em aberto para não contar o valor duas vezes (uma
  // como transferência e outra como restante virtual da fatura).
  const unlinked = payments.filter(
    (payment) =>
      payment.cartaoId === card.id && !payment.faturaChave && payment.pago,
  );
  if (unlinked.length > 0) {
    const ordered = [...buckets.entries()].sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
    for (const payment of unlinked) {
      let remaining = payment.valor;
      for (const [, totals] of ordered) {
        if (remaining <= 0) break;
        const open = Math.max(0, totals.total - totals.pago);
        if (open <= 0) continue;
        const applied = Math.min(open, remaining);
        totals.pago += applied;
        registrarPagador(totals, payment, applied);
        remaining -= applied;
      }
    }
  }

  return [...buckets.entries()]
    .map(([chave, totals]) => ({
      ...montarResumoFatura(chave, config, totals.total, totals.pago, hoje),
      pagamentos: [...totals.pagadores.values()].sort(
        (a, b) => b.valor - a.valor,
      ),
    }))
    .sort((a, b) => a.chave.localeCompare(b.chave));
}

function emptyInvoice(card: CreditCard, chave: string, hoje: string) {
  return montarResumoFatura(chave, cardConfig(card), 0, 0, hoje);
}

export type ForecastCardInvoice = {
  card: CreditCard;
  invoice: CardInvoiceSummary;
};

/**
 * Todas as faturas calculadas, incluindo compras virtuais de recorrências.
 * Usa a mesma função `invoicesForCard` da tela de cartões.
 */
export function listCardInvoicesForForecast(
  workspaceId: string,
  extraMovements: MovementRow[] = [],
): ForecastCardInvoice[] {
  const { db, ws } = scopedDb(workspaceId);
  const hoje = todayISO();
  const cards = db
    .select()
    .from(creditCards)
    .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
    .orderBy(asc(creditCards.arquivado), asc(creditCards.nome))
    .all();
  if (cards.length === 0) return [];

  const { movements, payments } = loadLedger(workspaceId);
  return cards.flatMap((card) =>
    invoicesForCard(card, movements, payments, hoje, extraMovements).map(
      (invoice) => ({ card, invoice }),
    ),
  );
}

export function listCards(workspaceId: string): CardWithInvoice[] {
  const { db, ws } = scopedDb(workspaceId);
  const hoje = todayISO();
  const rows = db
    .select({ card: creditCards, contaNome: accounts.nome })
    .from(creditCards)
    .leftJoin(accounts, eq(creditCards.contaPagamentoId, accounts.id))
    .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
    .orderBy(asc(creditCards.arquivado), asc(creditCards.nome))
    .all();

  if (rows.length === 0) return [];

  const { movements, payments } = loadLedger(workspaceId);
  const counts = db
    .select({
      cartaoId: transactions.cartaoId,
      total: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        isNotNull(transactions.cartaoId),
      ),
    )
    .groupBy(transactions.cartaoId)
    .all();
  const countByCard = new Map(counts.map((row) => [row.cartaoId, row.total]));

  return rows.map(({ card, contaNome }) => {
    const invoices = invoicesForCard(card, movements, payments, hoje);
    const currentKey = faturaDaCompra(hoje, cardConfig(card));
    const currentInvoice =
      invoices.find((invoice) => invoice.chave === currentKey) ??
      emptyInvoice(card, currentKey, hoje);
    const limiteUsado = calcularLimiteUsado(invoices);

    return {
      ...card,
      contaPagamentoNome: contaNome,
      currentInvoice,
      limiteUsado,
      disponivel: limiteDisponivel(card.limite, limiteUsado),
      comprasCount: countByCard.get(card.id) ?? 0,
    };
  });
}

export function getCardById(workspaceId: string, id: string) {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, id),
        ws(creditCards.workspaceId),
        isNull(creditCards.deletedAt),
      ),
    )
    .get();
}

export function countCardTransactions(
  workspaceId: string,
  id: string,
): number {
  const { db, ws } = scopedDb(workspaceId);
  const result = db
    .select({ total: sql<number>`count(*)` })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        sql`(${transactions.cartaoId} = ${id} or ${transactions.cartaoDestinoId} = ${id})`,
      ),
    )
    .get();

  return result?.total ?? 0;
}

export function getCardInvoiceDetail(
  workspaceId: string,
  cardId: string,
  chave: string,
): CardInvoiceDetail | null {
  const { db, ws } = scopedDb(workspaceId);
  const card = db
    .select({ card: creditCards, contaNome: accounts.nome })
    .from(creditCards)
    .leftJoin(accounts, eq(creditCards.contaPagamentoId, accounts.id))
    .where(
      and(
        eq(creditCards.id, cardId),
        ws(creditCards.workspaceId),
        isNull(creditCards.deletedAt),
      ),
    )
    .get();
  if (!card) return null;

  const hoje = todayISO();
  const { movements, payments } = loadLedger(workspaceId);
  const invoices = invoicesForCard(card.card, movements, payments, hoje);
  const currentKey = faturaDaCompra(hoje, cardConfig(card.card));
  const fatura =
    invoices.find((invoice) => invoice.chave === chave) ??
    emptyInvoice(card.card, chave, hoje);

  const interval = datasDaFatura(chave, cardConfig(card.card));
  const intervalEnd = addDaysISO(interval.fechamento, -1);
  const purchaseRows = db
    .select({
      id: transactions.id,
      tipo: transactions.tipo,
      descricao: transactions.descricao,
      valor: transactions.valor,
      data: transactions.data,
      pago: transactions.pago,
      categoriaId: transactions.categoriaId,
      categoriaNome: categories.nome,
      categoriaCor: categories.cor,
      categoriaIcone: categories.icone,
      parcelaAtual: transactions.parcelaAtual,
      parcelaTotal: transactions.parcelaTotal,
      observacao: transactions.observacao,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        eq(transactions.cartaoId, card.card.id),
        gte(transactions.data, interval.inicio),
        lte(transactions.data, intervalEnd),
      ),
    )
    .orderBy(asc(transactions.data), asc(transactions.createdAt))
    .all();

  const paymentRows = db
    .select({
      id: transactions.id,
      valor: transactions.valor,
      data: transactions.data,
      pago: transactions.pago,
      contaId: transactions.contaId,
      contaNome: accounts.nome,
      contaCor: accounts.cor,
      contaIcone: accounts.icone,
    })
    .from(transactions)
    .leftJoin(accounts, eq(transactions.contaId, accounts.id))
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        eq(transactions.cartaoDestinoId, card.card.id),
        eq(transactions.faturaChave, chave),
      ),
    )
    .orderBy(asc(transactions.data), asc(transactions.createdAt))
    .all();

  const used = calcularLimiteUsado(invoices);
  const contaPagamento = card.card.contaPagamentoId
    ? (db
        .select({
          id: accounts.id,
          nome: accounts.nome,
          cor: accounts.cor,
          icone: accounts.icone,
          arquivada: accounts.arquivada,
        })
        .from(accounts)
        .where(
          and(
            eq(accounts.id, card.card.contaPagamentoId),
            ws(accounts.workspaceId),
          ),
        )
        .get() ?? null)
    : null;

  return {
    card: { ...card.card, contaPagamentoNome: card.contaNome },
    fatura,
    purchases: purchaseRows as CardPurchaseItem[],
    payments: paymentRows,
    futureInvoices: invoices.filter(
      (invoice) => invoice.chave > chave && invoice.restante > 0,
    ),
    limiteUsado: used,
    disponivel: limiteDisponivel(card.card.limite, used),
    currentInvoiceChave: currentKey,
    contaPagamento,
  };
}

export function listCardInvoiceEventsForMonth(
  workspaceId: string,
  monthKey: string,
  filters: CardInvoiceFilters,
): CardInvoiceEvent[] {
  const { db, ws } = scopedDb(workspaceId);
  const hoje = todayISO();
  const cards = db
    .select()
    .from(creditCards)
    .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
    .all();
  if (cards.length === 0) return [];

  const { movements, payments } = loadLedger(workspaceId);
  const events: CardInvoiceEvent[] = [];

  for (const card of cards) {
    const invoices = invoicesForCard(card, movements, payments, hoje);
    for (const fatura of invoices) {
      if (!fatura.vencimento.startsWith(monthKey)) continue;
      if (fatura.total <= 0 && fatura.pago <= 0) continue;

      const passes = faturaPassaFiltros(
        {
          restante: fatura.restante,
          total: fatura.total,
          pago: fatura.pago,
          cartaoId: card.id,
          cartaoNome: card.nome,
          contaPagamentoId: card.contaPagamentoId,
        },
        filters,
      );
      if (!passes) continue;

      events.push({
        id: `${card.id}:${fatura.chave}`,
        cartaoId: card.id,
        cartaoNome: card.nome,
        cartaoCor: card.cor,
        cartaoIcone: card.icone,
        contaPagamentoId: card.contaPagamentoId,
        faturaChave: fatura.chave,
        inicio: fatura.inicio,
        fechamento: fatura.fechamento,
        vencimento: fatura.vencimento,
        total: fatura.total,
        pago: fatura.pago,
        restante: fatura.restante,
        status: fatura.status,
        vencida: fatura.vencida,
        pagamentos: fatura.pagamentos,
      });
    }
  }

  return events.sort(
    (a, b) =>
      a.vencimento.localeCompare(b.vencimento) ||
      a.cartaoNome.localeCompare(b.cartaoNome),
  );
}

const EMPTY_CARD_FILTERS: CardInvoiceFilters = {
  tipo: null,
  cartoes: [],
  contas: [],
  categorias: [],
  tags: [],
  status: "todos",
  q: null,
};

/** Eventos de fatura para os saldos previstos (sem filtros da tela). */
export function listCardInvoiceEventsForDayBalances(
  workspaceId: string,
  monthKey: string,
): CardInvoiceEvent[] {
  return listCardInvoiceEventsForMonth(
    workspaceId,
    monthKey,
    EMPTY_CARD_FILTERS,
  );
}

/** Deltas de previsto por conta de pagamento (todas as faturas em aberto). */
export function getCardInvoiceAccountDeltas(
  workspaceId: string,
): Map<string, number> {
  const { db, ws } = scopedDb(workspaceId);
  const hoje = todayISO();
  const cards = db
    .select()
    .from(creditCards)
    .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
    .all();
  if (cards.length === 0) return new Map();

  const { movements, payments } = loadLedger(workspaceId);
  const deltas = new Map<string, number>();

  for (const card of cards) {
    if (!card.contaPagamentoId) continue;
    const used = calcularLimiteUsado(
      invoicesForCard(card, movements, payments, hoje),
    );
    if (used > 0) {
      deltas.set(
        card.contaPagamentoId,
        (deltas.get(card.contaPagamentoId) ?? 0) - used,
      );
    }
  }

  return deltas;
}

/** Mapa `cartaoId:YYYY-MM` -> status calculado da fatura. */
export function getCardInvoiceStatuses(
  workspaceId: string,
): Map<
  string,
  { status: CardInvoiceSummary["status"]; total: number; pago: number; restante: number }
> {
  const { db, ws } = scopedDb(workspaceId);
  const hoje = todayISO();
  const cards = db
    .select()
    .from(creditCards)
    .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
    .all();
  const map = new Map<
    string,
    { status: CardInvoiceSummary["status"]; total: number; pago: number; restante: number }
  >();
  if (cards.length === 0) return map;

  const { movements, payments } = loadLedger(workspaceId);
  for (const card of cards) {
    for (const invoice of invoicesForCard(card, movements, payments, hoje)) {
      map.set(`${card.id}:${invoice.chave}`, {
        status: invoice.status,
        total: invoice.total,
        pago: invoice.pago,
        restante: invoice.restante,
      });
    }
  }
  return map;
}

export function listCardsForFilter(workspaceId: string): CardOption[] {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select({
      id: creditCards.id,
      nome: creditCards.nome,
      bandeira: creditCards.bandeira,
      cor: creditCards.cor,
      icone: creditCards.icone,
      arquivado: creditCards.arquivado,
      diaFechamento: creditCards.diaFechamento,
      diaVencimento: creditCards.diaVencimento,
      fechamentoCompra: creditCards.fechamentoCompra,
    })
    .from(creditCards)
    .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
    .orderBy(asc(creditCards.arquivado), asc(creditCards.nome))
    .all();
}
