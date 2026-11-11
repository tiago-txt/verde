import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  budgetCategories,
  budgetCycleExceptions,
  budgetVersions,
  budgets,
  categories,
  creditCards,
  transactions,
  type BudgetOrigin,
  type BudgetReserveDate,
  type BudgetVersionData,
} from "@/lib/db/schema";
import { addMonths, currentMonth, todayISO } from "@/lib/dates";
import {
  calcularCiclo,
  calcularGastoDoCiclo,
  categoriasBloqueadas,
  cicloDaData,
  ciclosEntre,
  ciclosRelevantesParaMes,
  eventosDoCiclo,
  eventoPassaFiltros,
  expandirCategorias,
  limiteDoCiclo,
  orcamentoVigenteNoCiclo,
  resolverCiclo,
  transacaoConsomeOrcamento,
  type BudgetCategoryUsage,
  type BudgetCycleInfo,
  type BudgetEventKind,
  type BudgetSeriesInput,
  type BudgetVersionInput,
} from "@/lib/finance/budgets";
import type { TransactionFilters } from "@/lib/finance/filters";
import { formatCurrency, formatDate } from "@/lib/format";
import { listAllCategories } from "./categories";

export type BudgetCategoryInfo = {
  id: string;
  nome: string;
  tipo: "despesa" | "receita";
  icone: string;
  cor: string;
  categoriaPaiId: string | null;
  deletedAt: Date | null;
};

export type BudgetWithCategories = {
  id: string;
  workspaceId: string;
  budgetId: string;
  ciclo: string;
  nome: string;
  valorPadrao: number;
  diaFechamento: number;
  antecedenciaCiclos: number;
  dataDaReserva: BudgetReserveDate;
  diaVencimento: number;
  origens: BudgetOrigin;
  contaId: string | null;
  cartaoId: string | null;
  dataInicio: string;
  dataFim: string | null;
  cor: string;
  icone: string;
  arquivado: boolean;
  exception: "excluido" | "ajustado" | null;
  categories: BudgetCategoryInfo[];
  overrides: Record<string, number>;
  contaNome: string | null;
  cartaoNome: string | null;
  cartaoFechamento: number | null;
  cartaoVencimento: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BudgetSpendingItem = {
  id: string;
  descricao: string;
  valor: number;
  data: string;
  pago: boolean;
  categoriaId: string | null;
  categoriaNome: string | null;
  categoriaCor: string | null;
  categoriaIcone: string | null;
};

export type BudgetCycleSummary = BudgetWithCategories &
  BudgetCycleInfo & {
    /** Categorias sincronizadas já expandidas (inclui subcategorias). */
    categoriaIds: string[];
  };

export type BudgetCycleDetail = {
  resumo: BudgetCycleSummary;
  transactions: BudgetSpendingItem[];
};

export type BudgetEventView = {
  id: string;
  tipoEvento: BudgetEventKind;
  data: string;
  valor: number;
  status: "prevista" | "apurada" | null;
  resumo: BudgetCycleSummary;
  transactions: BudgetSpendingItem[];
  /** Compatibilidade com o formato puro de eventos. */
  tipo: BudgetEventKind;
  ciclo: string;
};

export type BudgetCategoryOption = BudgetCategoryInfo & {
  /** Nome do orçamento que já usa a categoria, quando bloqueada. */
  blockedBy: string | null;
  blockedByBudgetId: string | null;
};

export type BudgetFormData = {
  categories: BudgetCategoryOption[];
  accounts: BudgetAccountOption[];
  cards: BudgetCardOption[];
  defaultAccountId: string | null;
  currentCycle: string;
  activeBudgets: BudgetCategoryUsage[];
};

export type BudgetCardOption = {
  id: string;
  nome: string;
  cor: string;
  icone: string;
  diaFechamento: number;
  diaVencimento: number;
  arquivado: boolean;
};

export type BudgetAccountOption = {
  id: string;
  nome: string;
  tipo: "corrente" | "poupanca" | "dinheiro" | "investimento";
  cor: string;
  icone: string;
  arquivada: boolean;
};

export type BudgetSeriesRow = BudgetSeriesInput & {
  workspaceId: string;
  cor: string;
  icone: string;
  createdAt: Date;
  updatedAt: Date;
  contaNome: string | null;
  cartaoNome: string | null;
  cartaoFechamento: number | null;
  cartaoVencimento: number | null;
  accountNames: Map<string, string>;
  cardsById: Map<
    string,
    { nome: string; diaFechamento: number; diaVencimento: number }
  >;
};

type SpendingPair = {
  budget: BudgetWithCategories;
  ciclo: string;
};

type SpendingResult = {
  info: BudgetCycleInfo;
  categoriaIds: Set<string>;
  transactions: BudgetSpendingItem[];
};

function pairKey(budgetId: string, ciclo: string): string {
  return `${budgetId}:${ciclo}`;
}

function cycleConfigFromBudget(budget: BudgetWithCategories) {
  return {
    valorPadrao: budget.valorPadrao,
    diaFechamento: budget.diaFechamento,
    antecedenciaCiclos: budget.antecedenciaCiclos,
    dataInicio: budget.dataInicio,
    dataFim: budget.dataFim,
    arquivado: budget.arquivado,
    dataDaReserva: budget.dataDaReserva,
    diaVencimento: budget.diaVencimento,
    origens: budget.origens,
    cartaoFechamento: budget.cartaoFechamento,
    cartaoVencimento: budget.cartaoVencimento,
  };
}

/**
 * Carrega a série bruta (orçamento + versões + exceções) com escopo de
 * workspace. As versões/exceções são a fonte de verdade; os campos da tabela
 * `budgets` continuam como base/legado.
 */
export function loadBudgetSeries(
  workspaceId: string,
  options?: { incluirArquivados?: boolean },
): BudgetSeriesRow[] {
  const { db, ws } = scopedDb(workspaceId);
  const budgetRows = db
    .select()
    .from(budgets)
    .where(
      options?.incluirArquivados
        ? ws(budgets.workspaceId)
        : and(ws(budgets.workspaceId), eq(budgets.arquivado, false)),
    )
    .orderBy(asc(budgets.arquivado), asc(budgets.nome))
    .all();

  if (budgetRows.length === 0) return [];
  const ids = budgetRows.map((budget) => budget.id);

  const versionRows = db
    .select()
    .from(budgetVersions)
    .where(
      and(
        ws(budgetVersions.workspaceId),
        inArray(budgetVersions.budgetId, ids),
      ),
    )
    .orderBy(asc(budgetVersions.vigenteApartir))
    .all();

  const exceptionRows = db
    .select()
    .from(budgetCycleExceptions)
    .where(
      and(
        ws(budgetCycleExceptions.workspaceId),
        inArray(budgetCycleExceptions.budgetId, ids),
      ),
    )
    .all();

  const legacyCategoryRows = db
    .select({
      budgetId: budgetCategories.budgetId,
      categoryId: budgetCategories.categoryId,
    })
    .from(budgetCategories)
    .where(
      and(
        ws(budgetCategories.workspaceId),
        inArray(budgetCategories.budgetId, ids),
      ),
    )
    .all();
  const legacyCategoriesByBudget = new Map<string, string[]>();
  for (const row of legacyCategoryRows) {
    const list = legacyCategoriesByBudget.get(row.budgetId) ?? [];
    list.push(row.categoryId);
    legacyCategoriesByBudget.set(row.budgetId, list);
  }

  const accountRows = db
    .select({
      id: accounts.id,
      nome: accounts.nome,
    })
    .from(accounts)
    .where(ws(accounts.workspaceId))
    .all();
  const accountById = new Map(accountRows.map((row) => [row.id, row.nome]));

  const cardRows = db
    .select({
      id: creditCards.id,
      nome: creditCards.nome,
      diaFechamento: creditCards.diaFechamento,
      diaVencimento: creditCards.diaVencimento,
    })
    .from(creditCards)
    .where(ws(creditCards.workspaceId))
    .all();
  const cardById = new Map(cardRows.map((row) => [row.id, row]));

  const versionsByBudget = new Map<string, BudgetVersionInput[]>();
  for (const version of versionRows) {
    const list = versionsByBudget.get(version.budgetId) ?? [];
    list.push({
      vigenteApartir: version.vigenteApartir,
      nome: version.nome,
      valorPadrao: version.valorPadrao,
      diaFechamento: version.diaFechamento,
      antecedenciaCiclos: version.antecedenciaCiclos,
      dataDaReserva: version.dataDaReserva,
      diaVencimento: version.diaVencimento,
      origens: version.origens,
      contaId: version.contaId,
      cartaoId: version.cartaoId,
      cor: version.cor,
      icone: version.icone,
      categoriaIds: version.categoriaIds,
    });
    versionsByBudget.set(version.budgetId, list);
  }

  const exceptionsByBudget = new Map<
    string,
    { ciclo: string; tipo: "excluido" | "ajustado"; dados?: Partial<BudgetVersionData> | null }[]
  >();
  for (const exception of exceptionRows) {
    const list = exceptionsByBudget.get(exception.budgetId) ?? [];
    list.push({
      ciclo: exception.ciclo,
      tipo: exception.tipo,
      dados: exception.dados ?? null,
    });
    exceptionsByBudget.set(exception.budgetId, list);
  }

  return budgetRows.map((budget) => {
    const versions = versionsByBudget.get(budget.id) ?? [];
    // Fallback para bases antigas que não tenham versão (não deve ocorrer após
    // a migration 0008, mas evita sumir orçamento em banco inconsistente).
    if (versions.length === 0) {
      versions.push({
        vigenteApartir: budget.dataInicio || budget.mes || currentMonth(),
        nome: budget.nome,
        valorPadrao: budget.valorPadrao,
        diaFechamento: budget.diaFechamento,
        antecedenciaCiclos: budget.antecedenciaCiclos,
        dataDaReserva: budget.dataDaReserva,
        diaVencimento: budget.diaVencimento,
        origens: budget.origens,
        contaId: budget.contaId,
        cartaoId: budget.cartaoId,
        cor: budget.cor,
        icone: budget.icone,
        categoriaIds:
          legacyCategoriesByBudget.get(budget.id) ??
          (budget.categoriaId ? [budget.categoriaId] : []),
      });
    }
    const dataInicio =
      budget.dataInicio ||
      versions[0]?.vigenteApartir ||
      currentMonth();
    const card = budget.cartaoId ? cardById.get(budget.cartaoId) : null;

    return {
      id: budget.id,
      workspaceId: budget.workspaceId,
      nome: budget.nome,
      dataInicio,
      dataFim: budget.dataFim,
      arquivado: budget.arquivado,
      versions,
      exceptions: exceptionsByBudget.get(budget.id) ?? [],
      cor: budget.cor,
      icone: budget.icone,
      createdAt: budget.createdAt,
      updatedAt: budget.updatedAt,
      contaNome: budget.contaId
        ? (accountById.get(budget.contaId) ?? null)
        : null,
      cartaoNome: card?.nome ?? null,
      cartaoFechamento: card?.diaFechamento ?? null,
      cartaoVencimento: card?.diaVencimento ?? null,
      accountNames: accountById,
      cardsById: new Map(
        cardRows.map((row) => [
          row.id,
          {
            nome: row.nome,
            diaFechamento: row.diaFechamento,
            diaVencimento: row.diaVencimento,
          },
        ]),
      ),
    };
  });
}

function toResolvedBudget(
  series: BudgetSeriesRow,
  ciclo: string,
  categoryById: Map<string, BudgetCategoryInfo>,
): BudgetWithCategories | null {
  const resolved = resolverCiclo(series, ciclo);
  if (!resolved) return null;

  const resolvedCategories = resolved.categoriaIds
    .map((id) => categoryById.get(id))
    .filter((category): category is BudgetCategoryInfo => Boolean(category));

  const resolvedCard = resolved.cartaoId
    ? series.cardsById.get(resolved.cartaoId)
    : null;

  return {
    ...resolved,
    id: resolved.budgetId,
    workspaceId: series.workspaceId,
    budgetId: resolved.budgetId,
    categories: resolvedCategories,
    overrides: {},
    contaNome: resolved.contaId
      ? (series.accountNames.get(resolved.contaId) ?? null)
      : null,
    cartaoNome: resolvedCard?.nome ?? null,
    cartaoFechamento: resolvedCard?.diaFechamento ?? null,
    cartaoVencimento: resolvedCard?.diaVencimento ?? null,
    createdAt: series.createdAt,
    updatedAt: series.updatedAt,
  };
}

function categoryInfoMap(
  workspaceId: string,
): Map<string, BudgetCategoryInfo> {
  return new Map(
    listAllCategories(workspaceId).map((category) => [
      category.id,
      {
        id: category.id,
        nome: category.nome,
        tipo: category.tipo,
        icone: category.icone,
        cor: category.cor,
        categoriaPaiId: category.categoriaPaiId,
        deletedAt: category.deletedAt,
      },
    ]),
  );
}

/** Orçamentos resolvidos para um ciclo (uma linha por série). */
export function listBudgetsWithCategories(
  workspaceId: string,
  ciclo: string = currentMonth(),
  options?: { incluirArquivados?: boolean },
): BudgetWithCategories[] {
  const series = loadBudgetSeries(workspaceId, options);
  const categoriesById = categoryInfoMap(workspaceId);
  return series
    .map((row) => toResolvedBudget(row, ciclo, categoriesById))
    .filter((budget): budget is BudgetWithCategories => Boolean(budget))
    .filter((budget) => options?.incluirArquivados || !budget.arquivado);
}

function loadSpending(
  workspaceId: string,
  pairs: SpendingPair[],
): Map<string, SpendingResult> {
  const { db, ws } = scopedDb(workspaceId);
  const result = new Map<string, SpendingResult>();
  if (pairs.length === 0) return result;

  const allCategories = listAllCategories(workspaceId).map((category) => ({
    id: category.id,
    categoriaPaiId: category.categoriaPaiId,
  }));

  const expandedByBudget = new Map<string, Set<string>>();
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  const allCategoryIds = new Set<string>();

  for (const { budget, ciclo } of pairs) {
    const expanded = expandirCategorias(
      allCategories,
      budget.categories.map((category) => category.id),
    );
    expandedByBudget.set(pairKey(budget.id, ciclo), expanded);
    const interval = calcularCiclo(
      cycleConfigFromBudget(budget),
      ciclo,
      0,
      {},
    );
    if (!minStart || interval.inicio < minStart) minStart = interval.inicio;
    if (!maxEnd || interval.fim > maxEnd) maxEnd = interval.fim;
    for (const id of expanded) allCategoryIds.add(id);
  }

  if (!minStart || !maxEnd) return result;

  const rows =
    allCategoryIds.size > 0
      ? db
          .select({
            id: transactions.id,
            descricao: transactions.descricao,
            valor: transactions.valor,
            data: transactions.data,
            pago: transactions.pago,
            categoriaId: transactions.categoriaId,
            categoriaNome: categories.nome,
            categoriaCor: categories.cor,
            categoriaIcone: categories.icone,
            tipo: transactions.tipo,
            cartaoId: transactions.cartaoId,
            deletedAt: transactions.deletedAt,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoriaId, categories.id))
          .where(
            and(
              ws(transactions.workspaceId),
              isNull(transactions.deletedAt),
              eq(transactions.tipo, "despesa"),
              gte(transactions.data, minStart),
              lte(transactions.data, maxEnd),
              inArray(transactions.categoriaId, [...allCategoryIds]),
            ),
          )
          .orderBy(asc(transactions.data), asc(transactions.createdAt))
          .all()
      : [];

  for (const { budget, ciclo } of pairs) {
    const key = pairKey(budget.id, ciclo);
    const expanded = expandedByBudget.get(key);
    if (!expanded) continue;

    const info = calcularCiclo(
      cycleConfigFromBudget(budget),
      ciclo,
      0,
      {},
    );

    const matching = rows.filter(
      (row) =>
        row.categoriaId &&
        expanded.has(row.categoriaId) &&
        transacaoConsomeOrcamento(budget.origens, row.cartaoId) &&
        row.data >= info.inicio &&
        row.data <= info.fim,
    );

    const gasto = calcularGastoDoCiclo(
      matching.map((row) => ({
        tipo: row.tipo,
        valor: row.valor,
        data: row.data,
        categoriaId: row.categoriaId,
        cartaoId: row.cartaoId,
        deletedAt: row.deletedAt,
      })),
      expanded,
      info.inicio,
      info.fim,
      budget.origens,
    );

    result.set(key, {
      info: {
        ...info,
        gasto,
        restante: Math.max(0, info.limite - gasto),
        estouro: Math.max(0, gasto - info.limite),
        proporcao: info.limite > 0 ? gasto / info.limite : gasto > 0 ? 1 : 0,
        percentual:
          info.limite > 0
            ? Math.round((gasto / info.limite) * 100)
            : gasto > 0
              ? 100
              : 0,
      },
      categoriaIds: expanded,
      transactions: matching.map((row) => ({
        id: row.id,
        descricao: row.descricao,
        valor: row.valor,
        data: row.data,
        pago: row.pago,
        categoriaId: row.categoriaId,
        categoriaNome: row.categoriaNome,
        categoriaCor: row.categoriaCor,
        categoriaIcone: row.categoriaIcone,
      })),
    });
  }

  return result;
}

function toCycleSummary(
  budget: BudgetWithCategories,
  ciclo: string,
  spending: SpendingResult,
): BudgetCycleSummary {
  return {
    ...budget,
    ...spending.info,
    ciclo,
    categoriaIds: [...spending.categoriaIds],
  };
}

export function listBudgetCycleDetails(
  workspaceId: string,
  ciclo: string,
  options?: { incluirArquivados?: boolean },
): BudgetCycleDetail[] {
  const all = listBudgetsWithCategories(workspaceId, ciclo, options);
  const eligible = all.filter(
    (budget) =>
      options?.incluirArquivados || !budget.arquivado,
  );

  const spending = loadSpending(
    workspaceId,
    eligible.map((budget) => ({ budget, ciclo })),
  );

  return eligible.flatMap((budget) => {
    const result = spending.get(pairKey(budget.id, ciclo));
    return result
      ? [
          {
            resumo: toCycleSummary(budget, ciclo, result),
            transactions: result.transactions,
          },
        ]
      : [];
  });
}

export function listBudgetCycleSummaries(
  workspaceId: string,
  ciclo: string,
  options?: { incluirArquivados?: boolean },
): BudgetCycleSummary[] {
  return listBudgetCycleDetails(workspaceId, ciclo, options).map(
    (detail) => detail.resumo,
  );
}

export function getBudgetCycleDetail(
  workspaceId: string,
  budgetId: string,
  ciclo: string,
): BudgetCycleDetail | null {
  const budget = listBudgetsWithCategories(workspaceId, ciclo, {
    incluirArquivados: true,
  }).find((item) => item.id === budgetId);
  if (!budget) return null;

  const spending = loadSpending(workspaceId, [{ budget, ciclo }]).get(
    pairKey(budget.id, ciclo),
  );
  if (!spending) return null;

  return {
    resumo: toCycleSummary(budget, ciclo, spending),
    transactions: spending.transactions,
  };
}

/** IDs de orçamentos com exceção "excluido" no ciclo. */
export function listExcludedBudgetCycles(
  workspaceId: string,
  ciclo: string,
): { budgetId: string; nome: string }[] {
  const series = loadBudgetSeries(workspaceId, { incluirArquivados: true });
  return series
    .filter(
      (row) =>
        (!row.dataInicio || row.dataInicio <= ciclo) &&
        (!row.dataFim || row.dataFim >= ciclo) &&
        row.exceptions.some(
          (exception) =>
            exception.ciclo === ciclo && exception.tipo === "excluido",
        ),
    )
    .map((row) => ({ budgetId: row.id, nome: row.nome }));
}

function buildEventContext(
  summary: BudgetCycleSummary,
  tipoEvento: BudgetEventKind,
): {
  tipo: BudgetEventKind;
  budgetNome: string;
  categoriaIds: string[];
  contaId: string | null;
} {
  return {
    tipo: tipoEvento,
    budgetNome: summary.nome,
    categoriaIds: summary.categoriaIds,
    contaId: summary.contaId,
  };
}

/**
 * Eventos virtuais (provisão/sobra) com datas no mês exibido.
 * Uma única consulta de lançamentos por chamada.
 */
export function getBudgetEventsForMonth(
  workspaceId: string,
  monthKey: string,
  filters: TransactionFilters,
): BudgetEventView[] {
  const series = loadBudgetSeries(workspaceId);
  const categoriesById = categoryInfoMap(workspaceId);
  const cycles = ciclosRelevantesParaMes(monthKey);

  const pairs: SpendingPair[] = [];
  for (const row of series) {
    if (row.arquivado) continue;
    for (const ciclo of cycles) {
      const budget = toResolvedBudget(row, ciclo, categoriesById);
      if (budget) pairs.push({ budget, ciclo });
    }
  }

  const spending = loadSpending(workspaceId, pairs);
  const today = todayISO();
  const events: BudgetEventView[] = [];

  for (const { budget, ciclo } of pairs) {
    const data = spending.get(pairKey(budget.id, ciclo));
    if (!data) continue;

    const summary = toCycleSummary(budget, ciclo, data);
    const cycleEvents = eventosDoCiclo(
      cycleConfigFromBudget(budget),
      ciclo,
      data.info.gasto,
      {},
    );

    for (const event of cycleEvents) {
      if (!event.data.startsWith(monthKey)) continue;
      const passes = eventoPassaFiltros(
        buildEventContext(summary, event.tipo),
        filters,
      );
      if (!passes) continue;

      events.push({
        id: `${budget.id}:${ciclo}:${event.tipo}`,
        tipoEvento: event.tipo,
        tipo: event.tipo,
        ciclo,
        data: event.data,
        valor: event.valor,
        status:
          event.tipo === "sobra" && event.data < today ? "apurada" : null,
        resumo: summary,
        transactions: data.transactions,
      });
    }
  }

  return events.sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.resumo.nome.localeCompare(b.resumo.nome),
  );
}

function emptyBudgetFilters(monthKey: string): TransactionFilters {
  return {
    mes: monthKey,
    tipo: null,
    contas: [],
    categorias: [],
    tags: [],
    status: "todos",
    q: null,
    dias: 10,
    detalhe: null,
    cartoes: [],
    comprasCartao: false,
    de: null,
    ate: null,
  };
}

/**
 * Eventos de M-1 e M para os saldos previstos acumulados. Os eventos de M-1
 * carregam provisões ainda abertas para o início de M (ciclos encerrados
 * anteriormente já se anulam e não alteram o saldo).
 */
export function getBudgetEventsForDayBalances(
  workspaceId: string,
  monthKey: string,
): BudgetEventView[] {
  const previous = addMonths(monthKey, -1);
  return [
    ...getBudgetEventsForMonth(
      workspaceId,
      previous,
      emptyBudgetFilters(previous),
    ),
    ...getBudgetEventsForMonth(
      workspaceId,
      monthKey,
      emptyBudgetFilters(monthKey),
    ),
  ];
}

/** Deltas por conta para o saldo previsto (provisões −, sobras +). */
export function getBudgetAccountDeltasForMonth(
  workspaceId: string,
  monthKey: string,
): Map<string, number> {
  const events = getBudgetEventsForDayBalances(workspaceId, monthKey);
  const deltas = new Map<string, number>();

  for (const event of events) {
    const contaId = event.resumo.contaId;
    if (!contaId) continue;
    const delta = event.tipoEvento === "provisao" ? -event.valor : event.valor;
    if (delta === 0) continue;
    deltas.set(contaId, (deltas.get(contaId) ?? 0) + delta);
  }

  return deltas;
}

export function getDefaultBudgetAccountId(workspaceId: string): string | null {
  const { db, ws } = scopedDb(workspaceId);
  const mostUsed = db
    .select({
      contaId: transactions.contaId,
      total: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        sql`${transactions.contaId} is not null`,
      ),
    )
    .groupBy(transactions.contaId)
    .orderBy(sql`count(*) desc`)
    .limit(1)
    .get();

  if (mostUsed?.contaId) {
    const account = db
      .select({
        id: accounts.id,
        arquivada: accounts.arquivada,
        deletedAt: accounts.deletedAt,
      })
      .from(accounts)
      .where(
        and(eq(accounts.id, mostUsed.contaId), ws(accounts.workspaceId)),
      )
      .get();

    if (account && !account.arquivada && !account.deletedAt) {
      return account.id;
    }
  }

  const first = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        ws(accounts.workspaceId),
        isNull(accounts.deletedAt),
        eq(accounts.arquivada, false),
      ),
    )
    .orderBy(asc(accounts.nome))
    .limit(1)
    .get();

  return first?.id ?? null;
}

function listBudgetAccounts(workspaceId: string): BudgetAccountOption[] {
  const { db, ws } = scopedDb(workspaceId);
  return db
    .select({
      id: accounts.id,
      nome: accounts.nome,
      tipo: accounts.tipo,
      cor: accounts.cor,
      icone: accounts.icone,
      arquivada: accounts.arquivada,
    })
    .from(accounts)
    .where(and(ws(accounts.workspaceId), isNull(accounts.deletedAt)))
    .orderBy(asc(accounts.arquivada), asc(accounts.nome))
    .all();
}

export function getBudgetFormData(
  workspaceId: string,
  ciclo?: string,
): BudgetFormData {
  const { db, ws } = scopedDb(workspaceId);
  const cycle = ciclo ?? currentMonth();
  const allBudgets = listBudgetsWithCategories(workspaceId, cycle);
  const allCategories = listAllCategories(workspaceId).filter(
    (category) => category.tipo === "despesa" && !category.deletedAt,
  );
  const activeBudgets: BudgetCategoryUsage[] = allBudgets.map((budget) => ({
    budgetId: budget.id,
    budgetNome: budget.nome,
    categoriaIds: budget.categories.map((category) => category.id),
  }));

  // Reaproveita a mesma regra pura usada pelo formulário para marcar bloqueios.
  const blocked = categoriasBloqueadas(allCategories, activeBudgets);
  const parentOf = new Map(
    allCategories
      .filter((category) => category.categoriaPaiId)
      .map((category) => [category.id, category.categoriaPaiId as string]),
  );
  const blockedBy = new Map<string, string>();
  for (const usage of activeBudgets) {
    for (const id of expandirCategorias(allCategories, usage.categoriaIds)) {
      if (!blockedBy.has(id)) blockedBy.set(id, usage.budgetId);
      let parent = parentOf.get(id);
      while (parent) {
        if (!blockedBy.has(parent)) blockedBy.set(parent, usage.budgetId);
        parent = parentOf.get(parent);
      }
    }
  }

  return {
    categories: allCategories.map((category) => ({
      id: category.id,
      nome: category.nome,
      tipo: category.tipo,
      icone: category.icone,
      cor: category.cor,
      categoriaPaiId: category.categoriaPaiId,
      deletedAt: category.deletedAt,
      blockedBy: blocked.get(category.id) ?? null,
      blockedByBudgetId: blockedBy.get(category.id) ?? null,
    })),
    accounts: listBudgetAccounts(workspaceId),
    cards: db
      .select({
        id: creditCards.id,
        nome: creditCards.nome,
        cor: creditCards.cor,
        icone: creditCards.icone,
        diaFechamento: creditCards.diaFechamento,
        diaVencimento: creditCards.diaVencimento,
        arquivado: creditCards.arquivado,
      })
      .from(creditCards)
      .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
      .orderBy(asc(creditCards.arquivado), asc(creditCards.nome))
      .all(),
    defaultAccountId: getDefaultBudgetAccountId(workspaceId),
    currentCycle: cycle,
    activeBudgets,
  };
}

export type BudgetNotice = {
  tone: "info" | "warning";
  message: string;
};

/**
 * Aviso de orçamento após criar/editar/duplicar lançamentos.
 * Recebe os pares categoria+data já persistidos.
 */
export function getBudgetNoticeForTransactions(
  workspaceId: string,
  items: {
    categoriaId: string | null;
    data: string;
    cartaoId?: string | null;
  }[],
): BudgetNotice | null {
  const relevant = items.filter((item) => item.categoriaId);
  if (relevant.length === 0) return null;

  const series = loadBudgetSeries(workspaceId);
  if (series.length === 0) return null;

  const categories = listAllCategories(workspaceId);
  const categoryById = categoryInfoMap(workspaceId);
  const notices = new Map<
    string,
    {
      nome: string;
      ciclo: string;
      info: BudgetCycleInfo;
      tone: "info" | "warning";
      message: string;
    }
  >();

  for (const item of relevant) {
    const monthKey = item.data.slice(0, 7);
    const candidateCycles = new Set(ciclosRelevantesParaMes(monthKey));
    candidateCycles.add(cicloDaData(item.data, 1));

    for (const row of series) {
      if (row.arquivado) continue;
      for (const ciclo of candidateCycles) {
        const budget = toResolvedBudget(row, ciclo, categoryById);
        if (!budget) continue;

        const info0 = calcularCiclo(
          cycleConfigFromBudget(budget),
          ciclo,
          0,
          {},
        );
        if (item.data < info0.inicio || item.data > info0.fim) continue;

        const expanded = expandirCategorias(
          categories,
          budget.categories.map((category) => category.id),
        );
        if (!item.categoriaId || !expanded.has(item.categoriaId)) continue;
        if (!transacaoConsomeOrcamento(budget.origens, item.cartaoId)) continue;

        const key = pairKey(budget.id, ciclo);
        if (notices.has(key)) continue;

        const spending = loadSpending(workspaceId, [{ budget, ciclo }]).get(
          key,
        );
        if (!spending) continue;
        const info = spending.info;

        const tone = info.estouro > 0 ? "warning" : "info";
        const message =
          info.estouro > 0
            ? `${budget.nome} estourou ${formatCurrency(info.estouro)} neste ciclo`
            : `${budget.nome}: restam ${formatCurrency(info.restante)} de ${formatCurrency(info.limite)} (ciclo até ${formatDate(info.fechamento).slice(0, 5)})`;

        notices.set(key, {
          nome: budget.nome,
          ciclo,
          info,
          tone,
          message,
        });
      }
    }
  }

  if (notices.size === 0) return null;

  const list = [...notices.values()];
  const tone = list.some((notice) => notice.tone === "warning")
    ? "warning"
    : "info";

  return {
    tone,
    message: list.map((notice) => notice.message).join(" · "),
  };
}

/** Valor padrão/override de um ciclo, útil para telas. */
export function getBudgetCycleLimit(
  budget: BudgetWithCategories,
  ciclo: string,
): number {
  return limiteDoCiclo(budget, ciclo, budget.overrides);
}

export { ciclosEntre };
