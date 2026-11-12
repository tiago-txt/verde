import { and, eq, inArray, isNull, lte } from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  creditCards,
  forecastPreferences,
  recurrences,
  transactions,
  type RecurrenceTemplate,
  type TransactionType,
} from "@/lib/db/schema";
import { addDaysISO, todayISO } from "@/lib/dates";
import { computeAccountBalances, type BalanceTransaction } from "@/lib/finance/balance";
import {
  cicloCompetencia,
  type CompetenceCard,
} from "@/lib/finance/competence";
import {
  expandirCategorias,
  eventosDoCiclo,
  resolverCiclo,
  transacaoConsomeOrcamento,
  type BudgetSeriesInput,
} from "@/lib/finance/budgets";
import { loadBudgetSeries } from "./budgets";
import {
  construirProjecao,
  causasDoPeriodo,
  detectarPeriodosNegativos,
  encontrarRecuperacao,
  fimDoHorizonte,
  menorSaldoDaSerie,
  parcelaMaximaSegura,
  resumoMensal,
  simular,
  type ForecastAccount,
  type ForecastCause,
  type ForecastDraft,
  type ForecastEvent,
  type ForecastHorizon,
  type ForecastMonth,
  type ForecastPeriod,
  type ForecastProjection,
  type ForecastRecovery,
  type ForecastSimulation,
} from "@/lib/finance/forecast";
import { buildInstallmentPlan } from "@/lib/finance/installments";
import { generateRecurrenceDates } from "@/lib/finance/recurrence";
import { datasDaFatura, faturaDaCompra } from "@/lib/finance/cards";
import { listAllCategories } from "./categories";
import { listBudgetForecastEvents, getBudgetCycleDetail } from "./budgets";
import { listCardInvoicesForForecast } from "./cards";

export type ForecastAlert = ForecastPeriod & {
  recuperacao: ForecastRecovery | null;
  causas: ForecastCause[];
};

export type ForecastData = {
  prefs: ForecastPreferences;
  contas: ForecastAccount[];
  contasDisponiveis: ForecastAccount[];
  projection: ForecastProjection;
  projectionCerto: ForecastProjection;
  alertas: ForecastAlert[];
  meses: ForecastMonth[];
  menorSaldo: { saldo: number; data: string };
  temReceitaAnual: boolean;
};

export type ForecastPreferences = {
  horizonte: ForecastHorizon;
  margem: number;
  contas: string[];
  incluirEstimativas: boolean;
};

export type ForecastOverrides = Partial<ForecastPreferences>;

export type ForecastDraftInput = {
  tipo: TransactionType;
  descricao: string;
  valor: number;
  data: string;
  parcelas: number;
  baseValor: "total" | "parcela";
  contaId: string | null;
  contaDestinoId?: string | null;
  cartaoId: string | null;
  categoriaId: string | null;
  orcamentoDeslocamento?: number;
};

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { expires: number; data: ForecastData }>();
const budgetForecastCache = new Map<
  string,
  { expires: number; data: ReturnType<typeof listBudgetForecastEvents> }
>();
const budgetDetailCache = new Map<
  string,
  { expires: number; data: ReturnType<typeof getBudgetCycleDetail> }
>();

export function invalidateForecastCache(workspaceId?: string): void {
  if (!workspaceId) {
    cache.clear();
    budgetForecastCache.clear();
    budgetDetailCache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) cache.delete(key);
  }
  for (const key of budgetForecastCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) budgetForecastCache.delete(key);
  }
  for (const key of budgetDetailCache.keys()) {
    if (key.startsWith(`${workspaceId}:`)) budgetDetailCache.delete(key);
  }
}

function cachedBudgetForecastEvents(
  workspaceId: string,
  startDate: string,
  endDate: string,
): ReturnType<typeof listBudgetForecastEvents> {
  const key = `${workspaceId}:${startDate}:${endDate}`;
  const cached = budgetForecastCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const data = listBudgetForecastEvents(workspaceId, startDate, endDate);
  budgetForecastCache.set(key, {
    expires: Date.now() + CACHE_TTL_MS,
    data,
  });
  return data;
}

function cachedBudgetCycleDetail(
  workspaceId: string,
  budgetId: string,
  ciclo: string,
): ReturnType<typeof getBudgetCycleDetail> {
  const key = `${workspaceId}:${budgetId}:${ciclo}`;
  const cached = budgetDetailCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;
  const data = getBudgetCycleDetail(workspaceId, budgetId, ciclo);
  budgetDetailCache.set(key, {
    expires: Date.now() + CACHE_TTL_MS,
    data,
  });
  return data;
}

function eligibleAccounts(workspaceId: string): ForecastAccount[] {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select({
      id: accounts.id,
      nome: accounts.nome,
      tipo: accounts.tipo,
      cor: accounts.cor,
      icone: accounts.icone,
      saldoInicial: accounts.saldoInicial,
      arquivada: accounts.arquivada,
    })
    .from(accounts)
    .where(and(ws(accounts.workspaceId), isNull(accounts.deletedAt)))
    .all()
    .filter((account) => account.tipo !== "investimento")
    .map((account) => ({
      id: account.id,
      nome: account.nome,
      tipo: account.tipo,
      cor: account.cor,
      icone: account.icone,
      saldoAtual: account.saldoInicial,
      arquivada: account.arquivada,
    }));
}

function parseContas(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function getForecastPreferences(
  workspaceId: string,
  userId: string,
): ForecastPreferences {
  const { db, ws } = scopedDb(workspaceId);
  const available = eligibleAccounts(workspaceId);
  const fallback = available
    .filter((account) => !account.arquivada)
    .map((account) => account.id);
  const row = db
    .select()
    .from(forecastPreferences)
    .where(
      and(
        eq(forecastPreferences.userId, userId),
        ws(forecastPreferences.workspaceId),
      ),
    )
    .get();

  if (!row) {
    return {
      horizonte: 12,
      margem: 0,
      contas: fallback,
      incluirEstimativas: true,
    };
  }

  const availableIds = new Set(available.map((account) => account.id));
  const contas = parseContas(row.contas).filter((id) => availableIds.has(id));
  return {
    horizonte: row.horizonte === 6 || row.horizonte === 24 ? row.horizonte : 12,
    margem: Math.max(0, row.margem),
    contas: contas.length > 0 ? contas : fallback,
    incluirEstimativas: row.incluirEstimativas,
  };
}

export function saveForecastPreferences(
  workspaceId: string,
  userId: string,
  prefs: ForecastPreferences,
): void {
  const { db, ws } = scopedDb(workspaceId);
  const availableIds = new Set(eligibleAccounts(workspaceId).map((a) => a.id));
  const contas = prefs.contas.filter((id) => availableIds.has(id));
  db.insert(forecastPreferences)
    .values({
      userId,
      workspaceId,
      horizonte: prefs.horizonte,
      margem: Math.max(0, prefs.margem),
      contas: JSON.stringify(contas),
      incluirEstimativas: prefs.incluirEstimativas,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: forecastPreferences.userId,
      set: {
        horizonte: prefs.horizonte,
        margem: Math.max(0, prefs.margem),
        contas: JSON.stringify(contas),
        incluirEstimativas: prefs.incluirEstimativas,
        updatedAt: new Date(),
      },
      where: ws(forecastPreferences.workspaceId),
    })
    .run();
  invalidateForecastCache(workspaceId);
}

type ForecastTransactionRow = {
  id: string;
  tipo: TransactionType;
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  contaId: string | null;
  contaDestinoId: string | null;
  cartaoId: string | null;
  cartaoDestinoId: string | null;
  faturaChave: string | null;
  categoriaId: string | null;
  recorrenciaId: string | null;
  parcelaGrupoId: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  deletedAt: Date | null;
};

function loadForecastTransactions(
  workspaceId: string,
  fim: string,
): ForecastTransactionRow[] {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select({
      id: transactions.id,
      tipo: transactions.tipo,
      descricao: transactions.descricao,
      valor: transactions.valor,
      data: transactions.data,
      pago: transactions.pago,
      contaId: transactions.contaId,
      contaDestinoId: transactions.contaDestinoId,
      cartaoId: transactions.cartaoId,
      cartaoDestinoId: transactions.cartaoDestinoId,
      faturaChave: transactions.faturaChave,
      categoriaId: transactions.categoriaId,
      recorrenciaId: transactions.recorrenciaId,
      parcelaGrupoId: transactions.parcelaGrupoId,
      parcelaAtual: transactions.parcelaAtual,
      parcelaTotal: transactions.parcelaTotal,
      deletedAt: transactions.deletedAt,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        lte(transactions.data, fim),
      ),
    )
    .all();
}

function realEvent(
  row: ForecastTransactionRow,
  hoje: string,
): ForecastEvent | null {
  if (row.cartaoId) return null;

  const atrasado = row.data <= hoje;
  if (atrasado && row.pago) return null;
  if (row.faturaChave && !row.pago) return null;

  const data = atrasado ? hoje : row.data;
  if (row.tipo === "transferencia" && row.cartaoDestinoId) {
    return {
      id: `tx:${row.id}`,
      data,
      tipo: "saida",
      valor: row.valor,
      contaId: row.contaId,
      kind: "transacao",
      certeza: "certo",
      descricao: row.descricao,
      categoriaId: row.categoriaId,
      recorrenciaId: row.recorrenciaId,
      parcelaGrupoId: row.parcelaGrupoId,
      parcelaAtual: row.parcelaAtual,
      parcelaTotal: row.parcelaTotal,
    };
  }

  return {
    id: `tx:${row.id}`,
    data,
    tipo:
      row.tipo === "receita"
        ? "entrada"
        : row.tipo === "despesa"
          ? "saida"
          : "transferencia",
    valor: row.valor,
    contaId: row.contaId,
    contaDestinoId: row.contaDestinoId,
    kind: "transacao",
    certeza: "certo",
    descricao: row.descricao,
    categoriaId: row.categoriaId,
    recorrenciaId: row.recorrenciaId,
    parcelaGrupoId: row.parcelaGrupoId,
    parcelaAtual: row.parcelaAtual,
    parcelaTotal: row.parcelaTotal,
  };
}

type ActiveRecurrence = {
  id: string;
  frequencia: "mensal" | "semanal" | "anual";
  dataInicio: string;
  dataFim: string | null;
  template: RecurrenceTemplate;
};

function loadActiveRecurrences(workspaceId: string): ActiveRecurrence[] {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select()
    .from(recurrences)
    .where(and(ws(recurrences.workspaceId), eq(recurrences.ativo, true)))
    .all()
    .map((row) => ({
      id: row.id,
      frequencia: row.frequencia,
      dataInicio: row.dataInicio,
      dataFim: row.dataFim,
      template: row.template as RecurrenceTemplate,
    }));
}

function existingRecurrenceDates(
  workspaceId: string,
  recurrenceIds: string[],
): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  if (recurrenceIds.length === 0) return map;
  const { db, ws } = scopedDb(workspaceId);
  const rows = db
    .select({
      recorrenciaId: transactions.recorrenciaId,
      data: transactions.data,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        inArray(transactions.recorrenciaId, recurrenceIds),
      ),
    )
    .all();
  for (const row of rows) {
    if (!row.recorrenciaId) continue;
    const set = map.get(row.recorrenciaId) ?? new Set<string>();
    set.add(row.data);
    map.set(row.recorrenciaId, set);
  }
  return map;
}

type VirtualCardMovement = {
  cartaoId: string;
  tipo: "despesa" | "receita" | "transferencia";
  valor: number;
  data: string;
};

function virtualRecurrenceEvents(
  workspaceId: string,
  hoje: string,
  fim: string,
): { eventos: ForecastEvent[]; cardMovements: VirtualCardMovement[] } {
  const recorrencias = loadActiveRecurrences(workspaceId);
  if (recorrencias.length === 0) {
    return { eventos: [], cardMovements: [] };
  }
  const existing = existingRecurrenceDates(
    workspaceId,
    recorrencias.map((row) => row.id),
  );
  const eventos: ForecastEvent[] = [];
  const cardMovements: VirtualCardMovement[] = [];

  for (const recurrence of recorrencias) {
    const dates = generateRecurrenceDates({
      frequencia: recurrence.frequencia,
      dataInicio: recurrence.dataInicio,
      dataFim: recurrence.dataFim,
      until: fim,
    });
    const seen = existing.get(recurrence.id) ?? new Set<string>();
    const template = recurrence.template;

    for (const rawDate of dates) {
      if (seen.has(rawDate)) continue;
      const data = rawDate < hoje ? hoje : rawDate;
      if (data > fim) continue;

      if (template.cartaoId) {
        cardMovements.push({
          cartaoId: template.cartaoId,
          tipo: template.tipo,
          valor: template.valor,
          data,
        });
        continue;
      }

      eventos.push({
        id: `rec:${recurrence.id}:${rawDate}`,
        data,
        tipo:
          template.tipo === "receita"
            ? "entrada"
            : template.tipo === "despesa"
              ? "saida"
              : "transferencia",
        valor: template.valor,
        contaId: template.contaId,
        contaDestinoId: template.contaDestinoId,
        kind: "recorrencia",
        certeza: "estimado",
        descricao: template.descricao,
        categoriaId: template.categoriaId,
        recorrenciaId: recurrence.id,
      });
    }
  }

  return { eventos, cardMovements };
}

function cardInvoiceEvents(
  workspaceId: string,
  hoje: string,
  fim: string,
  virtualMovements: VirtualCardMovement[],
): ForecastEvent[] {
  const invoices = listCardInvoicesForForecast(workspaceId, virtualMovements);
  const eventos: ForecastEvent[] = [];
  for (const { card, invoice } of invoices) {
    if (invoice.restante <= 0) continue;
    const data = invoice.vencimento < hoje ? hoje : invoice.vencimento;
    if (data > fim) continue;
    eventos.push({
      id: `fatura:${card.id}:${invoice.chave}`,
      data,
      tipo: "saida",
      valor: invoice.restante,
      contaId: card.contaPagamentoId,
      kind: "fatura",
      certeza: "certo",
      descricao: `Fatura ${card.nome} ${invoice.chave}`,
      cartaoId: card.id,
      cartaoNome: card.nome,
      faturaChave: invoice.chave,
    });
  }
  return eventos;
}

function budgetEvents(
  workspaceId: string,
  hoje: string,
  fim: string,
): ForecastEvent[] {
  return cachedBudgetForecastEvents(workspaceId, hoje, fim).map((event) => ({
    id: `budget:${event.id}`,
    data: event.data < hoje ? hoje : event.data,
    tipo: event.tipo === "provisao" ? "saida" : "entrada",
    valor: event.valor,
    contaId: event.contaId,
    kind: event.tipo === "provisao" ? "reserva" : "liberacao",
    certeza: "estimado",
    descricao:
      event.tipo === "provisao"
        ? `Reserva ${event.budgetNome}`
        : `Liberação ${event.budgetNome}`,
    budgetId: event.budgetId,
    budgetNome: event.budgetNome,
    budgetCiclo: event.budgetCiclo,
  }));
}

function currentBalances(
  workspaceId: string,
  contas: ForecastAccount[],
  rows: ForecastTransactionRow[],
  hoje: string,
): ForecastAccount[] {
  const paidUntilToday = rows.filter(
    (row) => row.pago && row.data <= hoje,
  ) as BalanceTransaction[];
  const balances = computeAccountBalances(
    contas.map((account) => ({
      id: account.id,
      saldoInicial: account.saldoAtual,
    })),
    paidUntilToday,
    "atual",
  );
  return contas.map((account) => ({
    ...account,
    saldoAtual: balances.get(account.id) ?? account.saldoAtual,
  }));
}

export function getForecastData(
  workspaceId: string,
  userId: string,
  overrides: ForecastOverrides = {},
): ForecastData {
  const prefs = {
    ...getForecastPreferences(workspaceId, userId),
    ...overrides,
  };
  const available = eligibleAccounts(workspaceId);
  const availableIds = new Set(available.map((account) => account.id));
  const selectedIds = prefs.contas.filter((id) => availableIds.has(id));
  const selected = available.filter((account) =>
    selectedIds.includes(account.id),
  );
  const contas = selected.length > 0
    ? selected
    : available.filter((account) => !account.arquivada);

  const hoje = todayISO();
  const fim = fimDoHorizonte(hoje, prefs.horizonte);
  const key = [
    workspaceId,
    userId,
    prefs.horizonte,
    prefs.margem,
    prefs.incluirEstimativas ? "1" : "0",
    contas.map((account) => account.id).join(","),
  ].join(":");
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.data;

  const rows = loadForecastTransactions(workspaceId, fim);
  const accountsWithBalance = currentBalances(workspaceId, contas, rows, hoje);
  const eventosReais = rows
    .map((row) => realEvent(row, hoje))
    .filter((event): event is ForecastEvent => Boolean(event));
  const { eventos: eventosRecorrencia, cardMovements } =
    virtualRecurrenceEvents(workspaceId, hoje, fim);
  const eventosFatura = cardInvoiceEvents(workspaceId, hoje, fim, cardMovements);
  const eventosOrcamento = budgetEvents(workspaceId, hoje, fim);

  const projection = construirProjecao({
    hoje,
    fim,
    margem: prefs.margem,
    contas: accountsWithBalance,
    eventos: [
      ...eventosReais,
      ...eventosRecorrencia,
      ...eventosFatura,
      ...eventosOrcamento,
    ],
    incluirEstimativas: prefs.incluirEstimativas,
  });
  const projectionCerto = construirProjecao({
    hoje,
    fim,
    margem: prefs.margem,
    contas: accountsWithBalance,
    eventos: [
      ...eventosReais,
      ...eventosRecorrencia,
      ...eventosFatura,
      ...eventosOrcamento,
    ],
    incluirEstimativas: false,
  });

  const alertas: ForecastAlert[] = detectarPeriodosNegativos(
    projection,
  ).map((period) => ({
    ...period,
    recuperacao: encontrarRecuperacao(projection, period),
    causas: causasDoPeriodo(projection, period),
  }));

  const data: ForecastData = {
    prefs: {
      horizonte: prefs.horizonte,
      margem: prefs.margem,
      contas: contas.map((account) => account.id),
      incluirEstimativas: prefs.incluirEstimativas,
    },
    contas: accountsWithBalance,
    contasDisponiveis: available,
    projection,
    projectionCerto,
    alertas,
    meses: resumoMensal(projection),
    menorSaldo: menorSaldoDaSerie(projection),
    temReceitaAnual: loadActiveRecurrences(workspaceId).some(
      (row) =>
        row.frequencia === "anual" && row.template.tipo === "receita",
    ),
  };

  cache.set(key, { expires: Date.now() + CACHE_TTL_MS, data });
  return data;
}

function cardConfig(card: {
  diaFechamento: number;
  diaVencimento: number;
  fechamentoCompra: "proxima_fatura" | "fatura_atual";
}): CompetenceCard {
  return {
    diaFechamento: card.diaFechamento,
    diaVencimento: card.diaVencimento,
    fechamentoCompra: card.fechamentoCompra,
  };
}

/**
 * Eventos do rascunho do modal. Usa as mesmas regras de parcelamento,
 * competência, fatura e orçamento das actions existentes.
 */
export function buildDraftForecastEvents(
  workspaceId: string,
  draft: ForecastDraftInput,
): ForecastEvent[] {
  const hoje = todayISO();
  const plan =
    draft.parcelas >= 2
      ? buildInstallmentPlan({
          valorCents: draft.valor,
          parcelas: draft.parcelas,
          dataInicio: draft.data,
          baseValor: draft.baseValor,
        })
      : [{ numero: 1, valor: draft.valor, data: draft.data }];

  const { db, ws } = scopedDb(workspaceId);
  const card = draft.cartaoId
    ? (db
        .select()
        .from(creditCards)
        .where(
          and(
            eq(creditCards.id, draft.cartaoId),
            ws(creditCards.workspaceId),
            isNull(creditCards.deletedAt),
          ),
        )
        .get() ?? null)
    : null;
  const config = card ? cardConfig(card) : null;

  const eventos: ForecastEvent[] = [];
  for (const item of plan) {
    if (card && config) {
      const chave = faturaDaCompra(item.data, config);
      const vencimento = datasDaFatura(chave, config).vencimento;
      eventos.push({
        id: `draft:${item.numero}:fatura`,
        data: vencimento,
        tipo: draft.tipo === "receita" ? "entrada" : "saida",
        valor: item.valor,
        contaId: card.contaPagamentoId,
        kind: "fatura",
        certeza: "certo",
        descricao: draft.descricao,
        cartaoId: card.id,
        cartaoNome: card.nome,
        faturaChave: chave,
        categoriaId: draft.categoriaId,
        parcelaAtual: item.numero,
        parcelaTotal: plan.length,
        parcelaGrupoId: plan.length > 1 ? "draft" : null,
      });
    } else {
      eventos.push({
        id: `draft:${item.numero}`,
        data: item.data < hoje ? hoje : item.data,
        tipo:
          draft.tipo === "receita"
            ? "entrada"
            : draft.tipo === "despesa"
              ? "saida"
              : "transferencia",
        valor: item.valor,
        contaId: draft.contaId,
        contaDestinoId: draft.contaDestinoId ?? null,
        kind: "transacao",
        certeza: "certo",
        descricao: draft.descricao,
        categoriaId: draft.categoriaId,
        parcelaAtual: item.numero,
        parcelaTotal: plan.length,
        parcelaGrupoId: plan.length > 1 ? "draft" : null,
      });
    }
  }

  // Ajuste de orçamento: recalcula o ciclo afetado e injeta a diferença.
  if (draft.categoriaId && draft.tipo !== "transferencia") {
    const series = loadBudgetSeries(workspaceId);
    const categories = listAllCategories(workspaceId);
    const affected = new Map<
      string,
      {
        budgetId: string;
        budgetNome: string;
        ciclo: string;
        delta: number;
        series: BudgetSeriesInput;
      }
    >();

    for (const item of plan) {
      for (const seriesRow of series) {
        if (seriesRow.arquivado) continue;
        const baseMonth = item.data.slice(0, 7);
        for (let delta = -6; delta <= 6; delta += 1) {
          const candidate = addMonthsKey(baseMonth, delta);
          const resolved = resolverCiclo(seriesRow, candidate);
          if (!resolved) continue;
          const consumed = cicloCompetencia(
            {
              tipo: draft.tipo,
              data: item.data,
              cartaoId: draft.cartaoId,
              orcamentoDeslocamento: draft.orcamentoDeslocamento,
            },
            resolved.diaFechamento,
            config,
          );
          if (consumed !== candidate) continue;

          const expanded = expandirCategorias(
            categories,
            resolved.categoriaIds,
          );
          if (!expanded.has(draft.categoriaId)) continue;
          if (!transacaoConsomeOrcamento(resolved.origens, draft.cartaoId)) {
            continue;
          }

          const key = `${seriesRow.id}:${candidate}`;
          const signed =
            draft.tipo === "despesa" ? item.valor : -item.valor;
          const current = affected.get(key);
          if (current) {
            current.delta += signed;
          } else {
            affected.set(key, {
              budgetId: seriesRow.id,
              budgetNome: resolved.nome,
              ciclo: candidate,
              delta: signed,
              series: seriesRow,
            });
          }
        }
      }
    }

    if (affected.size > 0) {
      const baseEvents = cachedBudgetForecastEvents(
        workspaceId,
        hoje,
        fimDoHorizonte(hoje, 24),
      );
      for (const entry of affected.values()) {
        const detail = cachedBudgetCycleDetail(
          workspaceId,
          entry.budgetId,
          entry.ciclo,
        );
        if (!detail) continue;
        const resolved = resolverCiclo(entry.series, entry.ciclo);
        if (!resolved) continue;

        const baseCycleEvents = baseEvents.filter(
          (event) =>
            event.budgetId === entry.budgetId &&
            event.budgetCiclo === entry.ciclo,
        );
        for (const event of baseCycleEvents) {
          eventos.push({
            id: `draft:reverte:${event.id}`,
            data: event.data < hoje ? hoje : event.data,
            tipo: event.tipo === "provisao" ? "entrada" : "saida",
            valor: event.valor,
            contaId: event.contaId,
            kind: event.tipo === "provisao" ? "liberacao" : "reserva",
            certeza: "estimado",
            descricao: "Ajuste de simulação",
            budgetId: event.budgetId,
            budgetNome: event.budgetNome,
            budgetCiclo: event.budgetCiclo,
          });
        }

        const novos = eventosDoCiclo(
          {
            valorPadrao: resolved.valorPadrao,
            diaFechamento: resolved.diaFechamento,
            antecedenciaCiclos: resolved.antecedenciaCiclos,
            dataInicio: resolved.dataInicio,
            dataFim: resolved.dataFim,
            arquivado: resolved.arquivado,
            origens: resolved.origens,
          },
          entry.ciclo,
          detail.resumo.gasto + entry.delta,
          {},
        );
        for (const event of novos) {
          eventos.push({
            id: `draft:novo:${entry.budgetId}:${entry.ciclo}:${event.tipo}`,
            data: event.data < hoje ? hoje : event.data,
            tipo: event.tipo === "provisao" ? "saida" : "entrada",
            valor: event.valor,
            contaId: resolved.contaId,
            kind: event.tipo === "provisao" ? "reserva" : "liberacao",
            certeza: "estimado",
            descricao: `Reserva ${resolved.nome}`,
            budgetId: entry.budgetId,
            budgetNome: resolved.nome,
            budgetCiclo: entry.ciclo,
          });
        }
      }
    }
  }

  return eventos;
}

function addMonthsKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 2000, (month ?? 1) - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function simulateForecast(
  workspaceId: string,
  userId: string,
  draft: ForecastDraftInput,
  overrides: ForecastOverrides = {},
): {
  data: ForecastData;
  simulation: ForecastSimulation;
  maxParcela: { valorParcela: number; parcelas: number; valorTotal: number } | null;
} {
  const data = getForecastData(workspaceId, userId, overrides);
  const eventos = buildDraftForecastEvents(workspaceId, draft);
  const rascunho: ForecastDraft = { descricao: draft.descricao, eventos };
  const simulation = simular(data.projection, rascunho);

  const parcelas = Math.max(1, draft.parcelas);
  const maxParcela =
    simulation.novosPeriodos.length > 0
      ? parcelaMaximaSegura(
          data.projection,
          data.prefs.margem,
          parcelas,
          (valorParcela) =>
            buildDraftForecastEvents(workspaceId, {
              ...draft,
              valor: valorParcela,
              baseValor: "parcela",
            }),
        )
      : null;

  return { data, simulation, maxParcela };
}

export function getForecastBanner(
  workspaceId: string,
  userId: string,
  month: string,
): ForecastAlert | null {
  const data = getForecastData(workspaceId, userId);
  return (
    data.alertas.find(
      (alert) =>
        alert.inicio.slice(0, 7) <= month && alert.fim.slice(0, 7) >= month,
    ) ?? null
  );
}
