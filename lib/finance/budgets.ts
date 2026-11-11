import { addDaysISO, addMonths, dateInMonth } from "@/lib/dates";
import type { TransactionType } from "@/lib/db/schema";
import type { MonthSummary } from "./summary";

/**
 * Regras puras dos orçamentos-envelope com ciclo (tipo fatura de cartão).
 *
 * O ciclo `YYYY-MM` começa no dia de fechamento daquele mês e termina no dia
 * anterior ao fechamento do mês seguinte. O fechamento/acerto acontece no
 * `dia_fechamento` do mês seguinte.
 */

export const BUDGET_EVENT_KINDS = ["provisao", "sobra"] as const;
export type BudgetEventKind = (typeof BUDGET_EVENT_KINDS)[number];

export type BudgetCycleConfig = {
  valorPadrao: number;
  diaFechamento: number;
  antecedenciaCiclos: number;
  dataInicio: string;
  dataFim: string | null;
  arquivado?: boolean;
};

export type BudgetCycleInfo = {
  ciclo: string;
  inicio: string;
  fim: string;
  /** Data de fechamento/acerto (dia de fechamento do mês seguinte). */
  fechamento: string;
  limite: number;
  gasto: number;
  restante: number;
  estouro: number;
  /** gasto / limite (pode passar de 1 em caso de estouro). */
  proporcao: number;
  percentual: number;
};

export type BudgetEvent = {
  tipo: BudgetEventKind;
  data: string;
  valor: number;
  ciclo: string;
};

export type BudgetEventFilters = {
  tipo: TransactionType | null;
  categorias: string[];
  contas: string[];
  tags: string[];
  status: "todos" | "pagos" | "nao_pagos";
  q: string | null;
};

export type BudgetEventFilterContext = {
  tipo: BudgetEventKind;
  budgetNome: string;
  categoriaIds: string[];
  contaId: string | null;
};

export type BudgetCategoryLike = {
  id: string;
  categoriaPaiId: string | null;
};

export type BudgetCategoryUsage = {
  budgetId: string;
  budgetNome: string;
  categoriaIds: string[];
};

export type BudgetSpendingTransaction = {
  tipo: TransactionType;
  valor: number;
  data: string;
  categoriaId: string | null;
  pago?: boolean;
  deletedAt?: Date | number | null;
};

export type InstallmentEvent = BudgetEvent;

function normalizarDia(diaFechamento: number): number {
  if (!Number.isFinite(diaFechamento)) return 1;
  return Math.min(31, Math.max(1, Math.trunc(diaFechamento)));
}

/** Ciclo (`YYYY-MM`) ao qual uma data pertence. */
export function cicloDaData(data: string, diaFechamento: number): string {
  const dia = normalizarDia(diaFechamento);
  const mes = data.slice(0, 7);
  const fechamentoDoMes = dateInMonth(mes, dia);
  return data >= fechamentoDoMes ? mes : addMonths(mes, -1);
}

/** Intervalo inclusivo [início, fim] do ciclo. */
export function intervaloDoCiclo(
  ciclo: string,
  diaFechamento: number,
): { inicio: string; fim: string } {
  const dia = normalizarDia(diaFechamento);
  const inicio = dateInMonth(ciclo, dia);
  const fechamentoSeguinte = dateInMonth(addMonths(ciclo, 1), dia);
  return { inicio, fim: addDaysISO(fechamentoSeguinte, -1) };
}

/** Data de fechamento/acerto do ciclo (dia de fechamento do mês seguinte). */
export function dataDeFechamento(
  ciclo: string,
  diaFechamento: number,
): string {
  return dateInMonth(addMonths(ciclo, 1), normalizarDia(diaFechamento));
}

/** Ciclos que podem gerar evento em um mês (anterior, atual e seguinte). */
export function ciclosRelevantesParaMes(mes: string): string[] {
  return [addMonths(mes, -1), mes, addMonths(mes, 1)];
}

export function orcamentoVigenteNoCiclo(
  budget: Pick<BudgetCycleConfig, "dataInicio" | "dataFim" | "arquivado">,
  ciclo: string,
): boolean {
  if (budget.arquivado) return false;
  if (!budget.dataInicio || budget.dataInicio > ciclo) return false;
  if (budget.dataFim && budget.dataFim < ciclo) return false;
  return true;
}

export type BudgetOverrides = Record<string, number> | Map<string, number>;

export function limiteDoCiclo(
  budget: Pick<BudgetCycleConfig, "valorPadrao">,
  ciclo: string,
  overrides?: BudgetOverrides,
): number {
  const override =
    overrides instanceof Map
      ? overrides.get(ciclo)
      : overrides?.[ciclo];
  return override ?? budget.valorPadrao;
}

/** Todas as categorias (raízes + descendentes) cobertas por um orçamento. */
export function expandirCategorias(
  categories: BudgetCategoryLike[],
  rootIds: Iterable<string>,
): Set<string> {
  const children = new Map<string, string[]>();
  for (const category of categories) {
    if (!category.categoriaPaiId) continue;
    const list = children.get(category.categoriaPaiId) ?? [];
    list.push(category.id);
    children.set(category.categoriaPaiId, list);
  }

  const result = new Set<string>();
  const stack = [...rootIds];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (result.has(id)) continue;
    result.add(id);
    for (const child of children.get(id) ?? []) stack.push(child);
  }

  return result;
}

/**
 * Categorias que não podem ser escolhidas porque já pertencem (direta ou
 * indiretamente) a outro orçamento ativo. Ancestrais também ficam bloqueados,
 * pois selecioná-los englobaria a categoria já usada.
 */
export function categoriasBloqueadas(
  categories: BudgetCategoryLike[],
  usages: BudgetCategoryUsage[],
): Map<string, string> {
  const parentOf = new Map(
    categories
      .filter((category) => category.categoriaPaiId)
      .map((category) => [category.id, category.categoriaPaiId as string]),
  );
  const blocked = new Map<string, string>();

  for (const usage of usages) {
    const covered = expandirCategorias(categories, usage.categoriaIds);
    for (const id of covered) {
      if (!blocked.has(id)) blocked.set(id, usage.budgetNome);
      let parent = parentOf.get(id);
      while (parent) {
        if (!blocked.has(parent)) blocked.set(parent, usage.budgetNome);
        parent = parentOf.get(parent);
      }
    }
  }

  return blocked;
}

/** Primeiro conflito entre as categorias escolhidas e outro orçamento ativo. */
export function encontrarConflitoDeCategorias(
  categories: BudgetCategoryLike[],
  selectedRootIds: Iterable<string>,
  usages: BudgetCategoryUsage[],
  ignoreBudgetId?: string,
): { categoryId: string; budgetNome: string } | null {
  const selected = expandirCategorias(categories, selectedRootIds);

  for (const usage of usages) {
    if (ignoreBudgetId && usage.budgetId === ignoreBudgetId) continue;
    const covered = expandirCategorias(categories, usage.categoriaIds);
    for (const id of selected) {
      if (covered.has(id)) {
        return { categoryId: id, budgetNome: usage.budgetNome };
      }
    }
  }

  return null;
}

export function calcularGastoDoCiclo(
  transactions: BudgetSpendingTransaction[],
  categoriaIds: ReadonlySet<string>,
  inicio: string,
  fim: string,
): number {
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.tipo !== "despesa") continue;
    if (!transaction.categoriaId) continue;
    if (!categoriaIds.has(transaction.categoriaId)) continue;
    if (transaction.data < inicio || transaction.data > fim) continue;
    total += transaction.valor;
  }
  return total;
}

export function calcularCiclo(
  budget: BudgetCycleConfig,
  ciclo: string,
  gasto: number,
  overrides?: BudgetOverrides,
): BudgetCycleInfo {
  const { inicio, fim } = intervaloDoCiclo(ciclo, budget.diaFechamento);
  const limite = Math.max(0, limiteDoCiclo(budget, ciclo, overrides));
  const restante = Math.max(0, limite - gasto);
  const estouro = Math.max(0, gasto - limite);
  const proporcao = limite > 0 ? gasto / limite : gasto > 0 ? 1 : 0;

  return {
    ciclo,
    inicio,
    fim,
    fechamento: dataDeFechamento(ciclo, budget.diaFechamento),
    limite,
    gasto,
    restante,
    estouro,
    proporcao,
    percentual: Math.round(proporcao * 100),
  };
}

/** Eventos virtuais do ciclo (nunca gravados como lançamentos). */
export function eventosDoCiclo(
  budget: BudgetCycleConfig,
  ciclo: string,
  gasto: number,
  overrides?: BudgetOverrides,
): BudgetEvent[] {
  if (!orcamentoVigenteNoCiclo(budget, ciclo)) return [];

  const result = calcularCiclo(budget, ciclo, gasto, overrides);
  if (result.estouro > 0 || result.restante <= 0) return [];

  const provisionDate =
    budget.antecedenciaCiclos === 1
      ? intervaloDoCiclo(addMonths(ciclo, -1), budget.diaFechamento).inicio
      : result.inicio;

  return [
    { tipo: "provisao", data: provisionDate, valor: result.restante, ciclo },
    { tipo: "sobra", data: result.fechamento, valor: result.restante, ciclo },
  ];
}

export function resumirEventos(eventos: BudgetEvent[]): {
  provisoes: number;
  sobras: number;
  liquido: number;
} {
  let provisoes = 0;
  let sobras = 0;
  for (const event of eventos) {
    if (event.tipo === "provisao") provisoes += event.valor;
    else sobras += event.valor;
  }
  return { provisoes, sobras, liquido: sobras - provisoes };
}

export type MonthSummaryWithBudgets = MonthSummary & {
  provisoesOrcamento: number;
  sobrasOrcamento: number;
};

/**
 * Incorpora provisões (−) e sobras (+) ao previsto, sem tocar no realizado.
 * Também soma os valores em saídas/entradas previstas para os detalhes.
 */
export function aplicarEventosAoResumo(
  summary: MonthSummary,
  eventos: BudgetEvent[],
): MonthSummaryWithBudgets {
  const { provisoes, sobras } = resumirEventos(eventos);

  const entradasPrevistas = summary.entradasPrevistas + sobras;
  const saidasPrevistas = summary.saidasPrevistas + provisoes;

  return {
    ...summary,
    entradasPrevistas,
    saidasPrevistas,
    saldoPrevisto: entradasPrevistas - saidasPrevistas,
    provisoesOrcamento: provisoes,
    sobrasOrcamento: sobras,
  };
}

/**
 * Adiciona os eventos aos saldos previstos acumulados por dia.
 * `balances` já é cumulativo; os eventos são aplicados nas suas datas.
 */
export function aplicarEventosAoSalsoDia(
  balances: Record<string, number>,
  eventos: BudgetEvent[],
): Record<string, number> {
  const deltas = new Map<string, number>();
  for (const event of eventos) {
    const delta = event.tipo === "provisao" ? -event.valor : event.valor;
    deltas.set(event.data, (deltas.get(event.data) ?? 0) + delta);
  }

  const ordered = Object.keys(balances).sort();
  const sortedDeltas = [...deltas.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );
  let index = 0;
  let running = 0;
  const result: Record<string, number> = {};

  for (const day of ordered) {
    while (index < sortedDeltas.length) {
      const [date, delta] = sortedDeltas[index] as [string, number];
      if (date > day) break;
      running += delta;
      index += 1;
    }
    result[day] = (balances[day] ?? 0) + running;
  }

  return result;
}

/** Regras de exibição das linhas virtuais na tela de lançamentos. */
export function eventoPassaFiltros(
  event: BudgetEventFilterContext,
  filters: BudgetEventFilters,
): boolean {
  // Eventos não têm status, tags nem tipo de lançamento próprio.
  if (filters.status !== "todos") return false;
  if (filters.tags.length > 0) return false;

  if (filters.tipo) {
    if (filters.tipo === "transferencia") return false;
    if (event.tipo === "provisao" && filters.tipo !== "despesa") return false;
    if (event.tipo === "sobra" && filters.tipo !== "receita") return false;
  }

  if (filters.categorias.length > 0) {
    const selected = new Set(filters.categorias);
    if (!event.categoriaIds.some((id) => selected.has(id))) return false;
  }

  if (filters.contas.length > 0) {
    if (!event.contaId || !filters.contas.includes(event.contaId)) {
      return false;
    }
  }

  const query = filters.q?.trim().toLowerCase();
  if (query && !event.budgetNome.toLowerCase().includes(query)) return false;

  return true;
}

export type BudgetImpact =
  | "sem-estouro"
  | "passou-a-estourar"
  | "aumentou"
  | "diminuiu"
  | "manteve";

/** Compara o estouro antes/depois de criar, editar ou remover um lançamento. */
export function avaliarImpactoEstouro(
  antes: number,
  depois: number,
): BudgetImpact {
  if (depois <= 0) return "sem-estouro";
  if (antes <= 0) return "passou-a-estourar";
  if (depois > antes) return "aumentou";
  if (depois < antes) return "diminuiu";
  return "manteve";
}

/** `YYYY-MM` de um ciclo deslocado. */
export { addMonths as deslocarCiclo };
