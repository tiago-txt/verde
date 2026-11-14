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
  type BudgetVersionData,
} from "@/lib/db/schema";
import { addMonths, currentMonth, monthRange, todayISO } from "@/lib/dates";
import {
  calcularCiclo,
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
import {
  cicloCompetencia,
  dataCompetencia,
  faturaDaTransacao,
  resolveCompetenceCard,
} from "@/lib/finance/competence";
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
  origens: BudgetOrigin;
  sobraPolicy: "rolar" | "liberar" | "realocar";
  sobraDestinoBudgetId: string | null;
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
  /** Data de competência usada no orçamento (vencimento da fatura no cartão). */
  competenciaData: string;
  /** Vencimento da fatura, quando o gasto veio do cartão. */
  viaFatura: string | null;
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
  /** Sobra do ciclo anterior embutida nesta linha (exibição unificada). */
  sobraAnterior?: {
    valor: number;
    ciclo: string;
    rolada?: boolean;
    realocadaPara?: { budgetId: string; nome: string } | null;
  } | null;
  /** Sobras recebidas de outros orçamentos neste ciclo. */
  sobraRecebida?: Array<{
    budgetId: string;
    nome: string;
    valor: number;
    ciclo: string;
  }>;
  /** Destino da sobra deste ciclo (evento de sobra). */
  sobraDestino?: { budgetId: string; nome: string } | null;
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
  /** Para onde a sobra deste ciclo foi realocada. */
  sobraTransferida?: { budgetId: string; nome: string } | null;
  /** Sobras recebidas de outros orçamentos neste ciclo. */
  sobraRecebida?: Array<{
    budgetId: string;
    nome: string;
    valor: number;
    ciclo: string;
  }>;
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
    origens: budget.origens,
    sobraPolicy: budget.sobraPolicy,
    sobraDestinoBudgetId: budget.sobraDestinoBudgetId,
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
      sobraPolicy: budget.sobraPolicy,
      sobraDestinoBudgetId: budget.sobraDestinoBudgetId,
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

type SpendingContext = {
  seriesByBudgetId: Map<string, BudgetSeriesRow>;
  categoriesById: Map<string, BudgetCategoryInfo>;
};

/**
 * Para orçamentos com rolagem, inclui os ciclos anteriores no cálculo do
 * gasto. Limita a 36 ciclos para não crescer indefinidamente em bases antigas.
 */
function expandRolloverPairs(
  pairs: SpendingPair[],
  context?: SpendingContext,
): SpendingPair[] {
  if (!context) return pairs;
  const byKey = new Map(
    pairs.map((pair) => [pairKey(pair.budget.id, pair.ciclo), pair]),
  );
  const seriesList = [...context.seriesByBudgetId.values()];
  const hasRealocacao = seriesList.some(
    (series) => series.sobraPolicy === "realocar",
  );

  // Com realocação, o destino (ou a origem) pode não estar no recorte inicial
  // de ciclos. Inclui todos os orçamentos ativos nos ciclos pedidos.
  if (hasRealocacao) {
    const requestedCycles = new Set(pairs.map((pair) => pair.ciclo));
    for (const ciclo of requestedCycles) {
      for (const series of seriesList) {
        const key = pairKey(series.id, ciclo);
        if (byKey.has(key)) continue;
        const resolved = toResolvedBudget(
          series,
          ciclo,
          context.categoriesById,
        );
        if (resolved) byKey.set(key, { budget: resolved, ciclo });
      }
    }
  }

  const destinationIds = new Set(
    seriesList
      .map((series) => series.sobraDestinoBudgetId)
      .filter((id): id is string => Boolean(id)),
  );

  for (const pair of byKey.values()) {
    const series = context.seriesByBudgetId.get(pair.budget.budgetId);
    if (!series) continue;
    const policy = series.sobraPolicy ?? "liberar";
    const expandsHistory =
      policy === "rolar" ||
      policy === "realocar" ||
      destinationIds.has(series.id);
    if (!expandsHistory) continue;
    const start = series.dataInicio || pair.ciclo;
    const cap = addMonths(pair.ciclo, -36);
    const from = start > cap ? start : cap;
    for (let ciclo = from; ciclo <= pair.ciclo; ciclo = addMonths(ciclo, 1)) {
      const key = pairKey(pair.budget.budgetId, ciclo);
      if (byKey.has(key)) continue;
      const resolved = toResolvedBudget(series, ciclo, context.categoriesById);
      if (!resolved) continue;
      byKey.set(key, { budget: resolved, ciclo });
    }
  }
  return [...byKey.values()];
}

/**
 * Aplica rolagem e realocação da sobra em ordem cronológica. A sobra de um
 * ciclo pode:
 * - `rolar`: aumentar o limite do próprio ciclo seguinte;
 * - `liberar`: voltar para o saldo livre;
 * - `realocar`: entrar no limite do orçamento de destino no ciclo seguinte.
 */
function applySobraPolicy(
  pairs: SpendingPair[],
  spending: Map<string, SpendingResult>,
  context?: SpendingContext,
): void {
  const byCycle = new Map<string, SpendingPair[]>();
  const allBudgetIds = new Set<string>();
  for (const pair of pairs) {
    const list = byCycle.get(pair.ciclo) ?? [];
    list.push(pair);
    byCycle.set(pair.ciclo, list);
    allBudgetIds.add(pair.budget.budgetId);
  }

  const cycles = [...byCycle.keys()].sort();
  const restanteByBudget = new Map<string, number>();

  for (const cycle of cycles) {
    const cyclePairs = byCycle.get(cycle) ?? [];
    const activeIds = new Set(
      cyclePairs.map((pair) => pair.budget.budgetId),
    );

    // Um orçamento inativo no ciclo não carrega sobra para o ciclo seguinte.
    for (const budgetId of allBudgetIds) {
      if (!activeIds.has(budgetId)) restanteByBudget.delete(budgetId);
    }

    for (const pair of cyclePairs) {
      const entry = spending.get(pairKey(pair.budget.budgetId, cycle));
      if (!entry) continue;
      const info = entry.info;
      const baseLimit = info.limite;
      const policy = pair.budget.sobraPolicy ?? "liberar";
      const ownRollover =
        policy === "rolar"
          ? (restanteByBudget.get(pair.budget.budgetId) ?? 0)
          : 0;
      const incoming = (entry.sobraRecebida ?? []).reduce(
        (sum, item) => sum + item.valor,
        0,
      );
      info.limite = Math.max(0, baseLimit + ownRollover + incoming);
      info.restante = Math.max(0, info.limite - info.gasto);
      info.estouro = Math.max(0, info.gasto - info.limite);
      info.proporcao =
        info.limite > 0 ? info.gasto / info.limite : info.gasto > 0 ? 1 : 0;
      info.percentual =
        info.limite > 0
          ? Math.round((info.gasto / info.limite) * 100)
          : info.gasto > 0
            ? 100
            : 0;
      restanteByBudget.set(pair.budget.budgetId, info.restante);
    }

    const nextCycle = addMonths(cycle, 1);
    const nextActive = new Set(
      (byCycle.get(nextCycle) ?? []).map((pair) => pair.budget.budgetId),
    );

    for (const pair of cyclePairs) {
      const policy = pair.budget.sobraPolicy ?? "liberar";
      if (policy !== "realocar") continue;
      const destinationId = pair.budget.sobraDestinoBudgetId;
      if (
        !destinationId ||
        destinationId === pair.budget.budgetId ||
        !nextActive.has(destinationId)
      ) {
        continue;
      }
      const amount = restanteByBudget.get(pair.budget.budgetId) ?? 0;
      if (amount <= 0) continue;

      const sourceEntry = spending.get(
        pairKey(pair.budget.budgetId, cycle),
      );
      if (sourceEntry) {
        sourceEntry.sobraTransferida = {
          budgetId: destinationId,
          nome:
            context?.seriesByBudgetId.get(destinationId)?.nome ??
            "orçamento",
        };
      }

      const destinationEntry = spending.get(
        pairKey(destinationId, nextCycle),
      );
      if (destinationEntry) {
        destinationEntry.sobraRecebida = [
          ...(destinationEntry.sobraRecebida ?? []),
          {
            budgetId: pair.budget.budgetId,
            nome: pair.budget.nome,
            valor: amount,
            ciclo: cycle,
          },
        ];
      }
    }
  }
}

function loadSpending(
  workspaceId: string,
  pairs: SpendingPair[],
  context?: SpendingContext,
): Map<string, SpendingResult> {
  const { db, ws } = scopedDb(workspaceId);
  const result = new Map<string, SpendingResult>();
  if (pairs.length === 0) return result;
  const allPairs = expandRolloverPairs(pairs, context);

  const allCategories = listAllCategories(workspaceId).map((category) => ({
    id: category.id,
    categoriaPaiId: category.categoriaPaiId,
  }));

  const expandedByBudget = new Map<string, Set<string>>();
  let minStart: string | null = null;
  let maxEnd: string | null = null;
  const allCategoryIds = new Set<string>();

  for (const { budget, ciclo } of allPairs) {
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

  const windowStart = monthRange(
    addMonths(minStart.slice(0, 7), -6),
  ).start;
  const windowEnd = monthRange(addMonths(maxEnd.slice(0, 7), 6)).end;

  const cardRows = db
    .select({
      id: creditCards.id,
      diaFechamento: creditCards.diaFechamento,
      diaVencimento: creditCards.diaVencimento,
      fechamentoCompra: creditCards.fechamentoCompra,
    })
    .from(creditCards)
    .where(ws(creditCards.workspaceId))
    .all();
  const cardById = new Map(cardRows.map((card) => [card.id, card]));

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
            orcamentoDeslocamento: transactions.orcamentoDeslocamento,
            cartaoFechamento: transactions.cartaoFechamento,
            cartaoVencimento: transactions.cartaoVencimento,
            cartaoFechamentoCompra: transactions.cartaoFechamentoCompra,
            deletedAt: transactions.deletedAt,
          })
          .from(transactions)
          .leftJoin(categories, eq(transactions.categoriaId, categories.id))
          .where(
            and(
              ws(transactions.workspaceId),
              isNull(transactions.deletedAt),
              inArray(transactions.tipo, ["despesa", "receita"]),
              gte(transactions.data, windowStart),
              lte(transactions.data, windowEnd),
              inArray(transactions.categoriaId, [...allCategoryIds]),
            ),
          )
          .orderBy(asc(transactions.data), asc(transactions.createdAt))
          .all()
      : [];

  for (const { budget, ciclo } of allPairs) {
    const key = pairKey(budget.id, ciclo);
    const expanded = expandedByBudget.get(key);
    if (!expanded) continue;

    const info = calcularCiclo(
      cycleConfigFromBudget(budget),
      ciclo,
      0,
      {},
    );

    const matching = rows.flatMap((row) => {
      if (!row.categoriaId || !expanded.has(row.categoriaId)) return [];
      if (!transacaoConsomeOrcamento(budget.origens, row.cartaoId)) return [];
      // Receita só reduz orçamento quando é estorno no cartão.
      if (row.tipo === "receita" && !row.cartaoId) return [];

      const card = row.cartaoId
        ? resolveCompetenceCard(
            {
              cartaoFechamento: row.cartaoFechamento,
              cartaoVencimento: row.cartaoVencimento,
              cartaoFechamentoCompra: row.cartaoFechamentoCompra,
            },
            cardById.get(row.cartaoId) ?? null,
          )
        : null;
      const competencia = dataCompetencia(
        {
          tipo: row.tipo,
          data: row.data,
          cartaoId: row.cartaoId,
          orcamentoDeslocamento: row.orcamentoDeslocamento,
        },
        card,
      );
      const consumed = cicloCompetencia(
        {
          tipo: row.tipo,
          data: row.data,
          cartaoId: row.cartaoId,
          orcamentoDeslocamento: row.orcamentoDeslocamento,
        },
        budget.diaFechamento,
        card,
      );
      if (consumed !== ciclo) return [];

      const fatura = faturaDaTransacao(
        {
          tipo: row.tipo,
          data: row.data,
          cartaoId: row.cartaoId,
        },
        card,
      );

      return [
        {
          row,
          competencia,
          viaFatura: fatura?.vencimento ?? null,
        },
      ];
    });

    const gasto = matching.reduce(
      (sum, item) =>
        sum + (item.row.tipo === "despesa" ? item.row.valor : -item.row.valor),
      0,
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
      transactions: matching.map(({ row, competencia, viaFatura }) => ({
        id: row.id,
        descricao: row.descricao,
        valor: row.valor,
        data: row.data,
        pago: row.pago,
        categoriaId: row.categoriaId,
        categoriaNome: row.categoriaNome,
        categoriaCor: row.categoriaCor,
        categoriaIcone: row.categoriaIcone,
        competenciaData: competencia,
        viaFatura,
      })),
    });
  }

  applySobraPolicy(allPairs, result, context);
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

  const series = loadBudgetSeries(workspaceId, options);
  const categoriesById = categoryInfoMap(workspaceId);
  const spending = loadSpending(
    workspaceId,
    eligible.map((budget) => ({ budget, ciclo })),
    {
      seriesByBudgetId: new Map(series.map((row) => [row.id, row])),
      categoriesById,
    },
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

  const seriesRow = loadBudgetSeries(workspaceId, {
    incluirArquivados: true,
  }).find((row) => row.id === budgetId);
  const categoriesById = categoryInfoMap(workspaceId);
  const spending = loadSpending(
    workspaceId,
    [{ budget, ciclo }],
    seriesRow
      ? {
          seriesByBudgetId: new Map([[seriesRow.id, seriesRow]]),
          categoriesById,
        }
      : undefined,
  ).get(pairKey(budget.id, ciclo));
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
  options?: { mergeSobras?: boolean },
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

  const spending = loadSpending(workspaceId, pairs, {
    seriesByBudgetId: new Map(series.map((row) => [row.id, row])),
    categoriesById,
  });
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
      { [ciclo]: data.info.limite },
    );

    for (const event of cycleEvents) {
      if (!event.data.startsWith(monthKey)) continue;
      const passes = eventoPassaFiltros(
        buildEventContext(summary, event.tipo),
        filters,
      );
      if (!passes) continue;

      const view: BudgetEventView = {
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
        sobraRecebida: data.sobraRecebida,
        sobraDestino:
          event.tipo === "sobra" ? (data.sobraTransferida ?? null) : null,
      };

      events.push(view);
    }
  }

  const sorted = events.sort(
    (a, b) =>
      a.data.localeCompare(b.data) ||
      a.resumo.nome.localeCompare(b.resumo.nome),
  );
  return options?.mergeSobras ? mergeSobrasNasProvisoes(sorted) : sorted;
}

/**
 * Junta a sobra do ciclo anterior na linha da provisão do ciclo seguinte.
 * As duas linhas caem na mesma data de fechamento/início do ciclo. O evento
 * de sobra continua existindo para os saldos; some apenas da lista.
 */
function mergeSobrasNasProvisoes(
  events: BudgetEventView[],
): BudgetEventView[] {
  const provisionByBudgetAndDate = new Map<string, BudgetEventView>();
  for (const event of events) {
    if (event.tipoEvento !== "provisao") continue;
    provisionByBudgetAndDate.set(
      `${event.resumo.budgetId}:${event.data}`,
      event,
    );
  }

  const merged: BudgetEventView[] = [];
  for (const event of events) {
    if (event.tipoEvento === "sobra") {
      const provision = provisionByBudgetAndDate.get(
        `${event.resumo.budgetId}:${event.data}`,
      );
      if (provision) {
        provision.sobraAnterior = {
          valor: event.valor,
          ciclo: event.ciclo,
          rolada: provision.resumo.sobraPolicy === "rolar",
          realocadaPara: event.sobraDestino ?? null,
        };
        continue;
      }
    }
    merged.push(event);
  }

  return merged;
}

export type ForecastBudgetEvent = {
  id: string;
  budgetId: string;
  budgetNome: string;
  budgetCiclo: string;
  tipo: "provisao" | "sobra";
  data: string;
  valor: number;
  contaId: string | null;
  cor: string;
  icone: string;
};

/**
 * Eventos de orçamento no intervalo da previsão. Reutiliza exatamente
 * `resolverCiclo`, `loadSpending` e `eventosDoCiclo` da tela de orçamentos.
 */
export function listBudgetForecastEvents(
  workspaceId: string,
  startDate: string,
  endDate: string,
): ForecastBudgetEvent[] {
  const series = loadBudgetSeries(workspaceId);
  if (series.length === 0) return [];

  const categoriesById = categoryInfoMap(workspaceId);
  const startMonth = addMonths(startDate.slice(0, 7), -2);
  const endMonth = addMonths(endDate.slice(0, 7), 1);
  const minDate = `${addMonths(startDate.slice(0, 7), -1)}-01`;
  const pairs: SpendingPair[] = [];

  for (const row of series) {
    if (row.arquivado) continue;
    for (const ciclo of ciclosEntre(startMonth, endMonth)) {
      const budget = toResolvedBudget(row, ciclo, categoriesById);
      if (budget) pairs.push({ budget, ciclo });
    }
  }

  const spending = loadSpending(workspaceId, pairs, {
    seriesByBudgetId: new Map(series.map((row) => [row.id, row])),
    categoriesById,
  });
  const events: ForecastBudgetEvent[] = [];

  for (const { budget, ciclo } of pairs) {
    const data = spending.get(pairKey(budget.id, ciclo));
    if (!data) continue;

    const cycleEvents = eventosDoCiclo(
      cycleConfigFromBudget(budget),
      ciclo,
      data.info.gasto,
      { [ciclo]: data.info.limite },
    );
    for (const event of cycleEvents) {
      if (event.data < minDate || event.data > endDate) continue;
      if (event.valor <= 0) continue;
      events.push({
        id: `${budget.id}:${ciclo}:${event.tipo}`,
        budgetId: budget.id,
        budgetNome: budget.nome,
        budgetCiclo: ciclo,
        tipo: event.tipo,
        data: event.data,
        valor: event.valor,
        contaId: budget.contaId,
        cor: budget.cor,
        icone: budget.icone,
      });
    }
  }

  return events.sort(
    (a, b) =>
      a.data.localeCompare(b.data) || a.budgetNome.localeCompare(b.budgetNome),
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
    orcamentoDeslocamento?: number | null;
    cartaoFechamento?: number | null;
    cartaoVencimento?: number | null;
    cartaoFechamentoCompra?: "proxima_fatura" | "fatura_atual" | null;
  }[],
): BudgetNotice | null {
  const relevant = items.filter((item) => item.categoriaId);
  if (relevant.length === 0) return null;

  const series = loadBudgetSeries(workspaceId);
  if (series.length === 0) return null;

  const { db, ws } = scopedDb(workspaceId);
  const cardRows = db
    .select({
      id: creditCards.id,
      diaFechamento: creditCards.diaFechamento,
      diaVencimento: creditCards.diaVencimento,
      fechamentoCompra: creditCards.fechamentoCompra,
    })
    .from(creditCards)
    .where(ws(creditCards.workspaceId))
    .all();
  const cardById = new Map(cardRows.map((card) => [card.id, card]));

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
    const candidateCycles = new Set<string>();
    for (let delta = -6; delta <= 6; delta += 1) {
      candidateCycles.add(addMonths(monthKey, delta));
    }

    const card = item.cartaoId
      ? resolveCompetenceCard(
          {
            cartaoFechamento: item.cartaoFechamento,
            cartaoVencimento: item.cartaoVencimento,
            cartaoFechamentoCompra: item.cartaoFechamentoCompra,
          },
          cardById.get(item.cartaoId) ?? null,
        )
      : null;

    for (const row of series) {
      if (row.arquivado) continue;
      for (const ciclo of candidateCycles) {
        const budget = toResolvedBudget(row, ciclo, categoryById);
        if (!budget) continue;

        const consumed = cicloCompetencia(
          {
            tipo: "despesa",
            data: item.data,
            cartaoId: item.cartaoId ?? null,
            orcamentoDeslocamento: item.orcamentoDeslocamento,
          },
          budget.diaFechamento,
          card,
        );
        if (consumed !== ciclo) continue;

        const expanded = expandirCategorias(
          categories,
          budget.categories.map((category) => category.id),
        );
        if (!item.categoriaId || !expanded.has(item.categoriaId)) continue;
        if (!transacaoConsomeOrcamento(budget.origens, item.cartaoId)) continue;

        const key = pairKey(budget.id, ciclo);
        if (notices.has(key)) continue;

        const spending = loadSpending(
          workspaceId,
          [{ budget, ciclo }],
          {
            seriesByBudgetId: new Map([[row.id, row]]),
            categoriesById: categoryById,
          },
        ).get(key);
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
