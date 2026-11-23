import { addDaysISO, addMonths, dateInMonth } from "@/lib/dates";
import type {
  BudgetOrigin,
  BudgetSobraPolicy,
  BudgetValueBase,
  BudgetVersionData,
  TransactionType,
} from "@/lib/db/schema";
import type { MonthSummary } from "./summary";

export { BUDGET_ORIGINS } from "@/lib/db/schema";
export type { BudgetOrigin } from "@/lib/db/schema";

/**
 * Regras puras dos orçamentos-envelope com ciclo (tipo fatura de cartão).
 *
 * O ciclo `YYYY-MM` começa no dia de fechamento daquele mês e termina no dia
 * anterior ao fechamento do mês seguinte. Com periodicidade maior que 1 mês,
 * o ciclo começa no `diaFechamento` do mês inicial e termina no dia anterior
 * ao fechamento do mês inicial + N.
 */

export const BUDGET_EVENT_KINDS = ["provisao", "sobra"] as const;
export type BudgetEventKind = (typeof BUDGET_EVENT_KINDS)[number];

export type BudgetCycleConfig = {
  valorPadrao: number;
  diaFechamento: number;
  /** Meses por ciclo (1 = mensal, 2 = bimestral, ..., 12 = anual). */
  periodicidadeMeses?: number;
  /** `total` = valor do período inteiro; `mensal` = valor por mês. */
  baseValorPeriodo?: BudgetValueBase;
  antecedenciaCiclos: number;
  dataInicio: string;
  dataFim: string | null;
  arquivado?: boolean;
  /** Origens de gasto que consomem o envelope. */
  origens?: BudgetOrigin;
  /** Destino da sobra no fim do ciclo. */
  sobraPolicy?: BudgetSobraPolicy;
  sobraDestinoBudgetId?: string | null;
  /** Modo indicador: acompanha gasto sem gerar reserva/liberação. */
  modoIndicador?: boolean;
  /** Só libera a sobra depois do fechamento manual do ciclo. */
  sobraApenasAoFechar?: boolean;
  /** O ciclo já foi fechado manualmente. */
  cicloFechado?: boolean;
  /** Data em que o ciclo foi fechado (YYYY-MM-DD), quando known. */
  fechadoEm?: string | null;
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

export type BudgetVersionInput = BudgetVersionData & {
  vigenteApartir: string;
};

export type BudgetCycleExceptionInput = {
  ciclo: string;
  tipo: "excluido" | "ajustado";
  dados?: Partial<BudgetVersionData> | null;
};

export type BudgetSeriesInput = {
  id: string;
  nome: string;
  dataInicio: string;
  dataFim: string | null;
  arquivado: boolean;
  sobraPolicy?: BudgetSobraPolicy;
  sobraDestinoBudgetId?: string | null;
  /** Só libera a sobra após fechar o ciclo manualmente. */
  sobraApenasAoFechar?: boolean;
  /** Ciclos já fechados manualmente, com a data do fechamento. */
  closures?: Array<{ ciclo: string; data: string }>;
  versions: BudgetVersionInput[];
  exceptions: BudgetCycleExceptionInput[];
};

export type ResolvedBudgetCycle = BudgetVersionData & {
  budgetId: string;
  ciclo: string;
  dataInicio: string;
  dataFim: string | null;
  arquivado: boolean;
  sobraPolicy: BudgetSobraPolicy;
  sobraDestinoBudgetId: string | null;
  sobraApenasAoFechar: boolean;
  fechado: boolean;
  fechadoEm: string | null;
  exception: "excluido" | "ajustado" | null;
};

/**
 * Resolve a configuração de um orçamento-série em um ciclo:
 * 1. vigência da série (dataInicio/dataFim);
 * 2. exceção do ciclo (excluído ou ajuste pontual);
 * 3. versão mais recente com `vigenteApartir <= ciclo`.
 *
 * Retorna `null` quando o ciclo não existe para a série (fora da vigência ou
 * excluído). Arquivamento é tratado por quem chama, pois a gestão precisa
 * exibir orçamentos arquivados.
 */
export function resolverCiclo(
  series: BudgetSeriesInput,
  ciclo: string,
): ResolvedBudgetCycle | null {
  if (!ciclo) return null;
  if (series.dataInicio && series.dataInicio > ciclo) return null;
  if (series.dataFim && series.dataFim < ciclo) return null;

  const exception =
    series.exceptions.find((item) => item.ciclo === ciclo) ?? null;
  if (exception?.tipo === "excluido") return null;

  const closure =
    series.closures?.find((item) => item.ciclo === ciclo) ?? null;

  const version = [...series.versions]
    .filter((item) => item.vigenteApartir <= ciclo)
    .sort((a, b) => b.vigenteApartir.localeCompare(a.vigenteApartir))[0];
  if (!version) return null;

  const ajustes =
    exception?.tipo === "ajustado" ? (exception.dados ?? {}) : {};
  const resolved: BudgetVersionData = {
    nome: ajustes.nome ?? version.nome ?? series.nome,
    valorPadrao: ajustes.valorPadrao ?? version.valorPadrao,
    diaFechamento: ajustes.diaFechamento ?? version.diaFechamento,
    periodicidadeMeses:
      ajustes.periodicidadeMeses ?? version.periodicidadeMeses ?? 1,
    baseValorPeriodo:
      ajustes.baseValorPeriodo ?? version.baseValorPeriodo ?? "total",
    antecedenciaCiclos:
      ajustes.antecedenciaCiclos ?? version.antecedenciaCiclos,
    origens: ajustes.origens ?? version.origens,
    contaId: ajustes.contaId !== undefined ? ajustes.contaId : version.contaId,
    cartaoId:
      ajustes.cartaoId !== undefined ? ajustes.cartaoId : version.cartaoId,
    cor: ajustes.cor ?? version.cor,
    icone: ajustes.icone ?? version.icone,
    categoriaIds: ajustes.categoriaIds ?? version.categoriaIds,
  };

  // Em séries com periodicidade maior que 1 mês, apenas os meses alinhados ao
  // início da série são inícios de ciclo válidos.
  if (
    !ehInicioDeCiclo(
      ciclo,
      series.dataInicio,
      resolved.periodicidadeMeses,
    )
  ) {
    return null;
  }

  return {
    ...resolved,
    budgetId: series.id,
    ciclo,
    dataInicio: series.dataInicio,
    dataFim: series.dataFim,
    arquivado: series.arquivado,
    sobraPolicy: series.sobraPolicy ?? "liberar",
    sobraDestinoBudgetId: series.sobraDestinoBudgetId ?? null,
    sobraApenasAoFechar: series.sobraApenasAoFechar ?? false,
    fechado: Boolean(closure),
    fechadoEm: closure?.data ?? null,
    exception: exception?.tipo ?? null,
  };
}

/** Lista os ciclos entre `start` e `end` (inclusive), com limite de segurança.
 * Inclui os 12 meses anteriores a `start` para que ciclos longos (anuais, por
 * exemplo) iniciados antes da janela ainda sejam encontrados e validados por
 * `resolverCiclo`.
 */
export function ciclosEntre(
  start: string,
  end: string | null,
  max = 240,
): string[] {
  if (!start) return [];
  const result: string[] = [];
  let current = addMonths(start, -12);
  while (result.length < max) {
    if (end && current > end) break;
    result.push(current);
    current = addMonths(current, 1);
    if (!end && result.length >= max) break;
  }
  return result;
}
export type BudgetSpendingTransaction = {
  tipo: TransactionType;
  valor: number;
  data: string;
  categoriaId: string | null;
  cartaoId?: string | null;
  pago?: boolean;
  deletedAt?: Date | number | null;
};

export type InstallmentEvent = BudgetEvent;

function normalizarDia(diaFechamento: number): number {
  if (!Number.isFinite(diaFechamento)) return 1;
  return Math.min(31, Math.max(1, Math.trunc(diaFechamento)));
}

/** Meses por ciclo, sempre entre 1 e 12. */
export function normalizarPeriodicidade(periodicidadeMeses?: number): number {
  if (!Number.isFinite(periodicidadeMeses)) return 1;
  return Math.min(12, Math.max(1, Math.trunc(periodicidadeMeses as number)));
}

/** Diferença em meses entre duas chaves `YYYY-MM`. */
function mesesEntre(de: string, ate: string): number {
  const [anoDe, mesDe] = de.split("-").map(Number);
  const [anoAte, mesAte] = ate.split("-").map(Number);
  if (!anoDe || !mesDe || !anoAte || !mesAte) return 0;
  return (anoAte - anoDe) * 12 + (mesAte - mesDe);
}

/**
 * O ciclo é um início válido da série? Mensal aceita qualquer mês; com N > 1,
 * os ciclos são alinhados ao mês de `dataInicio`.
 */
export function ehInicioDeCiclo(
  ciclo: string,
  dataInicio: string | null | undefined,
  periodicidadeMeses?: number,
): boolean {
  const periodicidade = normalizarPeriodicidade(periodicidadeMeses);
  if (periodicidade === 1) return true;
  if (!dataInicio) return true;
  return mesesEntre(dataInicio, ciclo) % periodicidade === 0;
}

/** Ciclo (`YYYY-MM`) ao qual uma data pertence. */
export function cicloDaData(
  data: string,
  diaFechamento: number,
  periodicidadeMeses = 1,
  dataInicio?: string | null,
): string {
  const dia = normalizarDia(diaFechamento);
  const mes = data.slice(0, 7);
  const fechamentoDoMes = dateInMonth(mes, dia);
  return data >= fechamentoDoMes ? mes : addMonths(mes, -1);
}

/** Intervalo inclusivo [início, fim] do ciclo. */
export function intervaloDoCiclo(
  ciclo: string,
  diaFechamento: number,
  periodicidadeMeses = 1,
): { inicio: string; fim: string } {
  const dia = normalizarDia(diaFechamento);
  const inicio = dateInMonth(ciclo, dia);
  const fechamentoSeguinte = dateInMonth(addMonths(ciclo, 1), dia);
  return { inicio, fim: addDaysISO(fechamentoSeguinte, -1) };
}

/** Data de fechamento/acerto do ciclo (dia de fechamento do mês inicial + N). */
export function dataDeFechamento(
  ciclo: string,
  diaFechamento: number,
  periodicidadeMeses = 1,
): string {
  return dateInMonth(addMonths(ciclo, 1), normalizarDia(diaFechamento));
}

/** A origem do lançamento consome o envelope? */
export function transacaoConsomeOrcamento(
  origens: BudgetOrigin | undefined,
  cartaoId: string | null | undefined,
): boolean {
  if (origens === "cartao") return Boolean(cartaoId);
  if (origens === "contas") return !cartaoId;
  return true;
}

/**
 * Ciclos que podem gerar evento em um mês. Inclui os 12 meses anteriores para
 * que um ciclo longo iniciado antes do mês ainda apareça; `resolverCiclo`
 * descarta os meses que não são início de ciclo.
 */
export function ciclosRelevantesParaMes(mes: string): string[] {
  return Array.from({ length: 14 }, (_, index) =>
    addMonths(mes, index - 12),
  );
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

/** Limite do ciclo: override pontual ou o valor padrão conforme a base. */
export function limiteDoCiclo(
  budget: Pick<
    BudgetCycleConfig,
    "valorPadrao" | "periodicidadeMeses" | "baseValorPeriodo"
  >,
  ciclo: string,
  overrides?: BudgetOverrides,
): number {
  const override =
    overrides instanceof Map
      ? overrides.get(ciclo)
      : overrides?.[ciclo];
  if (override !== undefined) return override;
  return budget.valorPadrao;
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
  origens: BudgetOrigin = "todas",
): number {
  let total = 0;
  for (const transaction of transactions) {
    if (transaction.deletedAt) continue;
    if (transaction.tipo !== "despesa") continue;
    if (!transaction.categoriaId) continue;
    if (!categoriaIds.has(transaction.categoriaId)) continue;
    if (!transacaoConsomeOrcamento(origens, transaction.cartaoId)) continue;
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
  const { inicio, fim } = intervaloDoCiclo(
    ciclo,
    budget.diaFechamento,
    budget.periodicidadeMeses,
  );
  const limite = Math.max(0, limiteDoCiclo(budget, ciclo, overrides));
  const restante = Math.max(0, limite - gasto);
  const estouro = Math.max(0, gasto - limite);
  const proporcao = limite > 0 ? gasto / limite : gasto > 0 ? 1 : 0;

  return {
    ciclo,
    inicio,
    fim,
    fechamento: dataDeFechamento(
      ciclo,
      budget.diaFechamento,
      budget.periodicidadeMeses,
    ),
    limite,
    gasto,
    restante,
    estouro,
    proporcao,
    percentual: Math.round(proporcao * 100),
  };
}

/**
 * A sobra do ciclo já pode sair do envelope? É a mesma condição usada pela
 * linha de sobra (`eventosDoCiclo`) e pela rolagem/realocação
 * (`applySobraPolicy` no banco), para as duas vias nunca divergirem.
 *
 * - modo indicador não movimenta dinheiro;
 * - com `sobraApenasAoFechar`, só depois do fechamento manual do ciclo;
 * - sem a opção, a sobra sai no fechamento do ciclo (ou já na data em que o
 *   ciclo foi fechado manualmente).
 */
export function sobraPodeSerLiberada(
  budget: Pick<
    BudgetCycleConfig,
    "sobraApenasAoFechar" | "cicloFechado" | "fechadoEm" | "modoIndicador"
  >,
): boolean {
  if (budget.modoIndicador) return false;
  if (!budget.sobraApenasAoFechar) return true;
  return budget.cicloFechado === true && Boolean(budget.fechadoEm);
}

/** Eventos virtuais do ciclo (nunca gravados como lançamentos). */
export function eventosDoCiclo(
  budget: BudgetCycleConfig,
  ciclo: string,
  gasto: number,
  overrides?: BudgetOverrides,
): BudgetEvent[] {
  if (!orcamentoVigenteNoCiclo(budget, ciclo)) return [];
  if (budget.modoIndicador) return [];

  const result = calcularCiclo(budget, ciclo, gasto, overrides);

  // A linha de provisão existe sempre que o ciclo existe. Quando o envelope
  // está consumido/estourado, a reserva é R$ 0,00 e o painel mostra o
  // resultado final; a linha não some.
  const provisionDate =
    budget.antecedenciaCiclos === 1
      ? intervaloDoCiclo(
          addMonths(ciclo, -normalizarPeriodicidade(budget.periodicidadeMeses)),
          budget.diaFechamento,
          budget.periodicidadeMeses,
        ).inicio
      : result.inicio;

  const events: BudgetEvent[] = [
    { tipo: "provisao", data: provisionDate, valor: result.restante, ciclo },
  ];
  // Sem linha de liberação com valor zero. O fechamento manual usa a data
  // consolidada no próprio fechamento; sem ele, o padrão é o fim do ciclo.
  const fechamentoManual =
    budget.cicloFechado === true && Boolean(budget.fechadoEm);
  if (result.restante > 0 && sobraPodeSerLiberada(budget)) {
    const sobraData = fechamentoManual
      ? (budget.fechadoEm as string) < result.inicio
        ? result.inicio
        : (budget.fechadoEm as string)
      : result.fechamento;
    events.push({
      tipo: "sobra",
      data: sobraData,
      valor: result.restante,
      ciclo,
    });
  }
  return events;
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
    if (delta === 0) continue;
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
