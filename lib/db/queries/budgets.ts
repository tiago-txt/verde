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
import { getDb } from "@/lib/db";
import {
  accounts,
  budgetCategories,
  budgetOverrides,
  budgets,
  categories,
  transactions,
  type Budget,
} from "@/lib/db/schema";
import { addMonths, currentMonth, todayISO } from "@/lib/dates";
import {
  calcularCiclo,
  calcularGastoDoCiclo,
  categoriasBloqueadas,
  cicloDaData,
  ciclosRelevantesParaMes,
  eventosDoCiclo,
  eventoPassaFiltros,
  expandirCategorias,
  limiteDoCiclo,
  type BudgetCycleInfo,
  type BudgetEventKind,
  type BudgetCategoryUsage,
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

export type BudgetWithCategories = Budget & {
  contaNome: string | null;
  categories: BudgetCategoryInfo[];
  overrides: Record<string, number>;
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
  defaultAccountId: string | null;
  currentCycle: string;
  activeBudgets: BudgetCategoryUsage[];
};

export type BudgetAccountOption = {
  id: string;
  nome: string;
  tipo: "corrente" | "poupanca" | "dinheiro" | "investimento";
  cor: string;
  icone: string;
  arquivada: boolean;
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

function dentroDaVigencia(budget: Budget, ciclo: string): boolean {
  if (!budget.dataInicio || budget.dataInicio > ciclo) return false;
  if (budget.dataFim && budget.dataFim < ciclo) return false;
  return true;
}

function pairKey(budgetId: string, ciclo: string): string {
  return `${budgetId}:${ciclo}`;
}

/** Carrega orçamentos + categorias + overrides em 3 consultas (sem N+1). */
export function listBudgetsWithCategories(options?: {
  incluirArquivados?: boolean;
}): BudgetWithCategories[] {
  const db = getDb();
  const rows = db
    .select({ budget: budgets, contaNome: accounts.nome })
    .from(budgets)
    .leftJoin(accounts, eq(budgets.contaId, accounts.id))
    .where(options?.incluirArquivados ? undefined : eq(budgets.arquivado, false))
    .orderBy(asc(budgets.arquivado), asc(budgets.nome))
    .all();

  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.budget.id);

  const categoryRows = db
    .select({
      budgetId: budgetCategories.budgetId,
      id: categories.id,
      nome: categories.nome,
      tipo: categories.tipo,
      icone: categories.icone,
      cor: categories.cor,
      categoriaPaiId: categories.categoriaPaiId,
      deletedAt: categories.deletedAt,
    })
    .from(budgetCategories)
    .innerJoin(categories, eq(budgetCategories.categoryId, categories.id))
    .where(inArray(budgetCategories.budgetId, ids))
    .orderBy(asc(categories.nome))
    .all();

  const overrideRows = db
    .select({
      budgetId: budgetOverrides.budgetId,
      ciclo: budgetOverrides.ciclo,
      valor: budgetOverrides.valorCentavos,
    })
    .from(budgetOverrides)
    .where(inArray(budgetOverrides.budgetId, ids))
    .all();

  const categoriesByBudget = new Map<string, BudgetCategoryInfo[]>();
  for (const row of categoryRows) {
    const list = categoriesByBudget.get(row.budgetId) ?? [];
    list.push({
      id: row.id,
      nome: row.nome,
      tipo: row.tipo,
      icone: row.icone,
      cor: row.cor,
      categoriaPaiId: row.categoriaPaiId,
      deletedAt: row.deletedAt,
    });
    categoriesByBudget.set(row.budgetId, list);
  }

  const overridesByBudget = new Map<string, Record<string, number>>();
  for (const row of overrideRows) {
    const map = overridesByBudget.get(row.budgetId) ?? {};
    map[row.ciclo] = row.valor;
    overridesByBudget.set(row.budgetId, map);
  }

  return rows.map(({ budget, contaNome }) => ({
    ...budget,
    contaNome,
    categories: categoriesByBudget.get(budget.id) ?? [],
    overrides: overridesByBudget.get(budget.id) ?? {},
  }));
}

function loadSpending(pairs: SpendingPair[]): Map<string, SpendingResult> {
  const db = getDb();
  const result = new Map<string, SpendingResult>();
  if (pairs.length === 0) return result;

  const allCategories = listAllCategories().map((category) => ({
    id: category.id,
    categoriaPaiId: category.categoriaPaiId,
  }));

  const expandedByBudget = new Map<string, Set<string>>();
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  const allCategoryIds = new Set<string>();

  for (const { budget, ciclo } of pairs) {
    if (!dentroDaVigencia(budget, ciclo)) continue;
    const expanded = expandirCategorias(
      allCategories,
      budget.categories.map((category) => category.id),
    );
    expandedByBudget.set(budget.id, expanded);
    const interval = calcularCiclo(
      {
        valorPadrao: budget.valorPadrao,
        diaFechamento: budget.diaFechamento,
        antecedenciaCiclos: budget.antecedenciaCiclos,
        dataInicio: budget.dataInicio,
        dataFim: budget.dataFim,
        arquivado: budget.arquivado,
      },
      ciclo,
      0,
      budget.overrides,
    );
    if (!minStart || interval.inicio < minStart) minStart = interval.inicio;
    if (!maxEnd || interval.fim > maxEnd) maxEnd = interval.fim;
    for (const id of expanded) allCategoryIds.add(id);
  }

  if (!minStart || !maxEnd || allCategoryIds.size === 0) return result;

  const rows = db
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
      deletedAt: transactions.deletedAt,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoriaId, categories.id))
    .where(
      and(
        isNull(transactions.deletedAt),
        eq(transactions.tipo, "despesa"),
        gte(transactions.data, minStart),
        lte(transactions.data, maxEnd),
        inArray(transactions.categoriaId, [...allCategoryIds]),
      ),
    )
    .orderBy(asc(transactions.data), asc(transactions.createdAt))
    .all();

  for (const { budget, ciclo } of pairs) {
    const expanded = expandedByBudget.get(budget.id);
    if (!expanded) continue;

    const info = calcularCiclo(
      {
        valorPadrao: budget.valorPadrao,
        diaFechamento: budget.diaFechamento,
        antecedenciaCiclos: budget.antecedenciaCiclos,
        dataInicio: budget.dataInicio,
        dataFim: budget.dataFim,
        arquivado: budget.arquivado,
      },
      ciclo,
      0,
      budget.overrides,
    );

    const matching = rows.filter(
      (row) =>
        row.categoriaId &&
        expanded.has(row.categoriaId) &&
        row.data >= info.inicio &&
        row.data <= info.fim,
    );

    const gasto = calcularGastoDoCiclo(
      matching.map((row) => ({
        tipo: row.tipo,
        valor: row.valor,
        data: row.data,
        categoriaId: row.categoriaId,
        deletedAt: row.deletedAt,
      })),
      expanded,
      info.inicio,
      info.fim,
    );

    result.set(pairKey(budget.id, ciclo), {
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
  ciclo: string,
  options?: { incluirArquivados?: boolean },
): BudgetCycleDetail[] {
  const all = listBudgetsWithCategories({
    incluirArquivados: options?.incluirArquivados,
  });
  const eligible = all.filter(
    (budget) =>
      dentroDaVigencia(budget, ciclo) &&
      (options?.incluirArquivados || !budget.arquivado),
  );

  const spending = loadSpending(
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
  ciclo: string,
  options?: { incluirArquivados?: boolean },
): BudgetCycleSummary[] {
  return listBudgetCycleDetails(ciclo, options).map((detail) => detail.resumo);
}

export function getBudgetCycleDetail(
  budgetId: string,
  ciclo: string,
): BudgetCycleDetail | null {
  const budget = listBudgetsWithCategories({ incluirArquivados: true }).find(
    (item) => item.id === budgetId,
  );
  if (!budget || !dentroDaVigencia(budget, ciclo)) return null;

  const spending = loadSpending([{ budget, ciclo }]).get(
    pairKey(budget.id, ciclo),
  );
  if (!spending) return null;

  return {
    resumo: toCycleSummary(budget, ciclo, spending),
    transactions: spending.transactions,
  };
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
  monthKey: string,
  filters: TransactionFilters,
): BudgetEventView[] {
  const all = listBudgetsWithCategories();
  const cycles = ciclosRelevantesParaMes(monthKey);

  const pairs: SpendingPair[] = [];
  for (const budget of all) {
    if (budget.arquivado) continue;
    for (const ciclo of cycles) {
      if (dentroDaVigencia(budget, ciclo)) pairs.push({ budget, ciclo });
    }
  }

  const spending = loadSpending(pairs);
  const today = todayISO();
  const events: BudgetEventView[] = [];

  for (const { budget, ciclo } of pairs) {
    const data = spending.get(pairKey(budget.id, ciclo));
    if (!data) continue;

    const summary = toCycleSummary(budget, ciclo, data);
    const cycleEvents = eventosDoCiclo(
      {
        valorPadrao: budget.valorPadrao,
        diaFechamento: budget.diaFechamento,
        antecedenciaCiclos: budget.antecedenciaCiclos,
        dataInicio: budget.dataInicio,
        dataFim: budget.dataFim,
        arquivado: budget.arquivado,
      },
      ciclo,
      data.info.gasto,
      budget.overrides,
    );

    for (const event of cycleEvents) {
      if (!event.data.startsWith(monthKey)) continue;
      const passes = eventoPassaFiltros(buildEventContext(summary, event.tipo), filters);
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
    (a, b) => a.data.localeCompare(b.data) || a.resumo.nome.localeCompare(b.resumo.nome),
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
  };
}

/**
 * Eventos de M-1 e M para os saldos previstos acumulados. Os eventos de M-1
 * carregam provisões ainda abertas para o início de M (ciclos encerrados
 * anteriormente já se anulam e não alteram o saldo).
 */
export function getBudgetEventsForDayBalances(
  monthKey: string,
): BudgetEventView[] {
  const previous = addMonths(monthKey, -1);
  return [
    ...getBudgetEventsForMonth(previous, emptyBudgetFilters(previous)),
    ...getBudgetEventsForMonth(monthKey, emptyBudgetFilters(monthKey)),
  ];
}

/** Deltas por conta para o saldo previsto (provisões −, sobras +). */
export function getBudgetAccountDeltasForMonth(
  monthKey: string,
): Map<string, number> {
  const events = getBudgetEventsForDayBalances(monthKey);
  const deltas = new Map<string, number>();

  for (const event of events) {
    const contaId = event.resumo.contaId;
    if (!contaId) continue;
    const delta = event.tipoEvento === "provisao" ? -event.valor : event.valor;
    deltas.set(contaId, (deltas.get(contaId) ?? 0) + delta);
  }

  return deltas;
}

export function getDefaultBudgetAccountId(): string | null {
  const db = getDb();
  const mostUsed = db
    .select({
      contaId: transactions.contaId,
      total: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(isNull(transactions.deletedAt), sql`${transactions.contaId} is not null`),
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
      .where(eq(accounts.id, mostUsed.contaId))
      .get();

    if (account && !account.arquivada && !account.deletedAt) {
      return account.id;
    }
  }

  const first = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(and(isNull(accounts.deletedAt), eq(accounts.arquivada, false)))
    .orderBy(asc(accounts.nome))
    .limit(1)
    .get();

  return first?.id ?? null;
}

function listBudgetAccounts(): BudgetAccountOption[] {
  return getDb()
    .select({
      id: accounts.id,
      nome: accounts.nome,
      tipo: accounts.tipo,
      cor: accounts.cor,
      icone: accounts.icone,
      arquivada: accounts.arquivada,
    })
    .from(accounts)
    .where(isNull(accounts.deletedAt))
    .orderBy(asc(accounts.arquivada), asc(accounts.nome))
    .all();
}

export function getBudgetFormData(): BudgetFormData {
  const cycle = currentMonth();
  const allBudgets = listBudgetsWithCategories();
  const allCategories = listAllCategories().filter(
    (category) => category.tipo === "despesa" && !category.deletedAt,
  );
  const activeBudgets: BudgetCategoryUsage[] = allBudgets
    .filter(
      (budget) =>
        !budget.arquivado &&
        (!budget.dataFim || budget.dataFim >= cycle),
    )
    .map((budget) => ({
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
    accounts: listBudgetAccounts(),
    defaultAccountId: getDefaultBudgetAccountId(),
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
  items: { categoriaId: string | null; data: string }[],
): BudgetNotice | null {
  const relevant = items.filter((item) => item.categoriaId);
  if (relevant.length === 0) return null;

  const allBudgets = listBudgetsWithCategories();
  if (allBudgets.length === 0) return null;

  const allCategories = listAllCategories().map((category) => ({
    id: category.id,
    categoriaPaiId: category.categoriaPaiId,
  }));

  const notices = new Map<
    string,
    { nome: string; ciclo: string; info: BudgetCycleInfo; tone: "info" | "warning"; message: string }
  >();

  for (const item of relevant) {
    for (const budget of allBudgets) {
      if (budget.arquivado) continue;
      const ciclo = cicloDaData(item.data, budget.diaFechamento);
      if (!dentroDaVigencia(budget, ciclo)) continue;

      const expanded = expandirCategorias(
        allCategories,
        budget.categories.map((category) => category.id),
      );
      if (!item.categoriaId || !expanded.has(item.categoriaId)) continue;

      const key = pairKey(budget.id, ciclo);
      if (notices.has(key)) continue;

      const spending = loadSpending([{ budget, ciclo }]).get(key);
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
