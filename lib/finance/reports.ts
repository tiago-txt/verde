import { addDaysISO, addMonths, dateInMonth, daysInMonth, monthRange } from "@/lib/dates";
import type { TransactionType } from "@/lib/db/schema";

export const REPORT_PERIODS = [
  "mes",
  "mes-anterior",
  "3m",
  "6m",
  "12m",
  "ano",
  "personalizado",
] as const;
export type ReportPeriod = (typeof REPORT_PERIODS)[number];

export const REPORT_TABS = ["categoria", "mes", "origem"] as const;
export type ReportTab = (typeof REPORT_TABS)[number];

export type DateRange = { from: string; to: string };

export type ReportRow = {
  tipo: TransactionType;
  valor: number;
  data: string;
  pago: boolean;
  categoriaId: string | null;
  categoriaNome: string | null;
  categoriaPaiId: string | null;
  categoriaPaiNome: string | null;
  categoriaPaiIcone: string | null;
  categoriaPaiCor: string | null;
  categoriaIcone: string | null;
  categoriaCor: string | null;
  contaId: string | null;
  contaNome: string | null;
  cartaoId: string | null;
  cartaoNome: string | null;
  cartaoCor: string | null;
  cartaoIcone: string | null;
  /** Fatura da compra (YYYY-MM), calculada na consulta pelo fechamento do cartão. */
  faturaChave: string | null;
};

export type ReportCategoryChild = {
  id: string;
  nome: string;
  icone: string | null;
  cor: string | null;
  total: number;
  count: number;
  average: number;
  percent: number;
};

export type ReportCategory = {
  id: string;
  nome: string;
  icone: string | null;
  cor: string | null;
  total: number;
  count: number;
  average: number;
  percent: number;
  previousTotal: number;
  variationPercent: number | null;
  children: ReportCategoryChild[];
};

export type CategoryReport = {
  total: number;
  count: number;
  items: ReportCategory[];
};

export type MonthlyPoint = {
  mes: string;
  receitas: number;
  despesas: number;
  saldo: number;
};

export type OriginReportItem = {
  id: string;
  kind: "conta" | "cartao";
  nome: string;
  cor: string | null;
  icone: string | null;
  total: number;
  count: number;
  average: number;
  percent: number;
  faturas: { chave: string; total: number }[];
};

export type OriginReport = {
  total: number;
  count: number;
  items: OriginReportItem[];
};

export function reportPeriodRange(
  period: ReportPeriod,
  referenceMonth: string,
  custom?: { from?: string | null; to?: string | null },
): DateRange {
  const reference = monthRange(referenceMonth);
  const referenceRange = { from: reference.start, to: reference.end };
  switch (period) {
    case "mes":
      return referenceRange;
    case "mes-anterior": {
      const previous = monthRange(addMonths(referenceMonth, -1));
      return { from: previous.start, to: previous.end };
    }
    case "3m":
    case "6m":
    case "12m": {
      const count = period === "3m" ? 3 : period === "6m" ? 6 : 12;
      return {
        from: monthRange(addMonths(referenceMonth, -(count - 1))).start,
        to: reference.end,
      };
    }
    case "ano":
      return {
        from: `${referenceMonth.slice(0, 4)}-01-01`,
        to: `${referenceMonth.slice(0, 4)}-12-31`,
      };
    case "personalizado": {
      if (
        custom?.from &&
        custom.to &&
        /^\d{4}-\d{2}-\d{2}$/.test(custom.from) &&
        /^\d{4}-\d{2}-\d{2}$/.test(custom.to) &&
        custom.from <= custom.to
      ) {
        return { from: custom.from, to: custom.to };
      }
      return referenceRange;
    }
  }
}

/** Período anterior equivalente, com a mesma quantidade de dias. */
export function previousEquivalentRange(range: DateRange): DateRange {
  const from = new Date(`${range.from}T12:00:00Z`).getTime();
  const to = new Date(`${range.to}T12:00:00Z`).getTime();
  const days = Math.max(1, Math.round((to - from) / 86_400_000) + 1);
  const previousTo = addDaysISO(range.from, -1);
  return { from: addDaysISO(previousTo, -(days - 1)), to: previousTo };
}

export function monthsInRange(range: DateRange): string[] {
  const result: string[] = [];
  let cursor = range.from.slice(0, 7);
  const end = range.to.slice(0, 7);
  for (let i = 0; i < 240 && cursor <= end; i += 1) {
    result.push(cursor);
    cursor = addMonths(cursor, 1);
  }
  return result;
}

export function percentChange(
  current: number,
  previous: number,
): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function isReportType(tipo: TransactionType): boolean {
  return tipo === "despesa" || tipo === "receita";
}

export function filterReportRows(
  rows: ReportRow[],
  options: { onlyPaid?: boolean } = {},
): ReportRow[] {
  return rows.filter((row) => {
    if (!isReportType(row.tipo)) return false;
    if (options.onlyPaid && !row.pago) return false;
    return true;
  });
}

export function rowsInRange(rows: ReportRow[], range: DateRange): ReportRow[] {
  return rows.filter((row) => row.data >= range.from && row.data <= range.to);
}

export function sumRows(rows: ReportRow[], tipo: TransactionType): number {
  return rows
    .filter((row) => row.tipo === tipo)
    .reduce((sum, row) => sum + row.valor, 0);
}

type CategoryAccumulator = {
  id: string;
  nome: string;
  icone: string | null;
  cor: string | null;
  total: number;
  count: number;
  children: Map<string, ReportCategoryChild>;
};

function categoryKey(row: ReportRow): string {
  return row.categoriaPaiId ?? row.categoriaId ?? "sem-categoria";
}

function categoryDisplay(row: ReportRow): {
  id: string;
  nome: string;
  icone: string | null;
  cor: string | null;
} {
  if (row.categoriaPaiId) {
    return {
      id: row.categoriaPaiId,
      nome: row.categoriaPaiNome ?? "Sem categoria",
      icone: row.categoriaPaiIcone,
      cor: row.categoriaPaiCor,
    };
  }
  return {
    id: row.categoriaId ?? "sem-categoria",
    nome: row.categoriaNome ?? "Sem categoria",
    icone: row.categoriaIcone,
    cor: row.categoriaCor,
  };
}

function accumulateCategories(
  rows: ReportRow[],
  tipo: TransactionType,
): Map<string, CategoryAccumulator> {
  const map = new Map<string, CategoryAccumulator>();

  for (const row of rows) {
    // No relatório de despesas, estornos no cartão reduzem o gasto da categoria.
    const isRefund =
      tipo === "despesa" && row.tipo === "receita" && Boolean(row.cartaoId);
    if (row.tipo !== tipo && !isRefund) continue;

    const sign = row.tipo === tipo ? 1 : -1;
    const key = categoryKey(row);
    const display = categoryDisplay(row);
    const parent =
      map.get(key) ??
      ({
        ...display,
        total: 0,
        count: 0,
        children: new Map<string, ReportCategoryChild>(),
      } satisfies CategoryAccumulator);

    parent.total += sign * row.valor;
    if (row.tipo === tipo) parent.count += 1;

    if (row.categoriaPaiId && row.categoriaId) {
      const current = parent.children.get(row.categoriaId) ?? {
        id: row.categoriaId,
        nome: row.categoriaNome ?? "Sem categoria",
        icone: row.categoriaIcone,
        cor: row.categoriaCor,
        total: 0,
        count: 0,
        average: 0,
        percent: 0,
      };
      current.total += sign * row.valor;
      if (row.tipo === tipo) current.count += 1;
      parent.children.set(row.categoriaId, current);
    }

    map.set(key, parent);
  }

  return map;
}

export function buildCategoryReport(
  rows: ReportRow[],
  previousRows: ReportRow[],
  tipo: TransactionType,
): CategoryReport {
  const current = accumulateCategories(rows, tipo);
  const previous = accumulateCategories(previousRows, tipo);
  const total = [...current.values()].reduce((sum, item) => sum + item.total, 0);
  const count = [...current.values()].reduce((sum, item) => sum + item.count, 0);

  const items = [...current.values()]
    .map((item) => {
      const previousTotal = previous.get(item.id)?.total ?? 0;
      return {
        id: item.id,
        nome: item.nome,
        icone: item.icone,
        cor: item.cor,
        total: item.total,
        count: item.count,
        average: item.count > 0 ? item.total / item.count : 0,
        percent: total > 0 ? (item.total / total) * 100 : 0,
        previousTotal,
        variationPercent: percentChange(item.total, previousTotal),
        children: [...item.children.values()]
          .map((child) => ({
            ...child,
            average: child.count > 0 ? child.total / child.count : 0,
            percent: item.total > 0 ? (child.total / item.total) * 100 : 0,
          }))
          .sort((a, b) => b.total - a.total),
      };
    })
    .sort((a, b) => b.total - a.total);

  return { total, count, items };
}

export type TopCategory = {
  id: string;
  nome: string;
  icone: string | null;
  cor: string | null;
  total: number;
  percent: number;
  others?: boolean;
};

export function buildTopCategories(
  rows: ReportRow[],
  tipo: TransactionType,
  limit = 6,
): { total: number; items: TopCategory[] } {
  const report = buildCategoryReport(rows, [], tipo);
  const top = report.items.slice(0, limit);
  const rest = report.items.slice(limit);
  const othersTotal = rest.reduce((sum, item) => sum + item.total, 0);

  const items: TopCategory[] = top.map((item) => ({
    id: item.id,
    nome: item.nome,
    icone: item.icone,
    cor: item.cor,
    total: item.total,
    percent: item.percent,
  }));

  if (othersTotal > 0) {
    items.push({
      id: "outras",
      nome: "Outras",
      icone: null,
      cor: null,
      total: othersTotal,
      percent: report.total > 0 ? (othersTotal / report.total) * 100 : 0,
      others: true,
    });
  }

  return { total: report.total, items };
}

export function buildMonthlySeries(
  rows: ReportRow[],
  range: DateRange,
): MonthlyPoint[] {
  const months = monthsInRange(range);
  const map = new Map<string, MonthlyPoint>(
    months.map((mes) => [mes, { mes, receitas: 0, despesas: 0, saldo: 0 }]),
  );

  for (const row of rows) {
    if (!isReportType(row.tipo)) continue;
    const point = map.get(row.data.slice(0, 7));
    if (!point) continue;
    if (row.tipo === "receita" && row.cartaoId) {
      // Estorno de cartão reduz a despesa, não vira receita.
      point.despesas -= row.valor;
    } else if (row.tipo === "receita") {
      point.receitas += row.valor;
    } else {
      point.despesas += row.valor;
    }
  }

  return months.map((mes) => {
    const point = map.get(mes) as MonthlyPoint;
    return { ...point, saldo: point.receitas - point.despesas };
  });
}

export function buildOriginReport(
  rows: ReportRow[],
  tipo: TransactionType,
): OriginReport {
  const map = new Map<
    string,
    {
      id: string;
      kind: "conta" | "cartao";
      nome: string;
      cor: string | null;
      icone: string | null;
      total: number;
      count: number;
      faturas: Map<string, number>;
    }
  >();

  for (const row of rows) {
    const isRefund =
      tipo === "despesa" && row.tipo === "receita" && Boolean(row.cartaoId);
    if (row.tipo !== tipo && !isRefund) continue;

    const sign = row.tipo === tipo ? 1 : -1;
    const isCard = Boolean(row.cartaoId);
    const id = row.cartaoId ?? row.contaId ?? "sem-origem";
    const key = `${isCard ? "cartao" : "conta"}:${id}`;
    const current = map.get(key) ?? {
      id,
      kind: isCard ? ("cartao" as const) : ("conta" as const),
      nome:
        (isCard ? row.cartaoNome : row.contaNome) ??
        (isCard ? "Cartão" : "Sem conta"),
      cor: isCard ? row.cartaoCor : null,
      icone: isCard ? row.cartaoIcone : null,
      total: 0,
      count: 0,
      faturas: new Map<string, number>(),
    };

    current.total += sign * row.valor;
    if (row.tipo === tipo) current.count += 1;
    if (isCard && row.faturaChave) {
      current.faturas.set(
        row.faturaChave,
        (current.faturas.get(row.faturaChave) ?? 0) + sign * row.valor,
      );
    }
    map.set(key, current);
  }

  const total = [...map.values()].reduce((sum, item) => sum + item.total, 0);
  const count = [...map.values()].reduce((sum, item) => sum + item.count, 0);
  const items = [...map.values()]
    .map((item) => ({
      id: item.id,
      kind: item.kind,
      nome: item.nome,
      cor: item.cor,
      icone: item.icone,
      total: item.total,
      count: item.count,
      average: item.count > 0 ? item.total / item.count : 0,
      percent: total > 0 ? (item.total / total) * 100 : 0,
      faturas: [...item.faturas.entries()]
        .map(([chave, value]) => ({ chave, total: value }))
        .sort((a, b) => a.chave.localeCompare(b.chave)),
    }))
    .sort((a, b) => b.total - a.total);

  return { total, count, items };
}

export type MonthlyCategorySeries = {
  months: string[];
  categories: { id: string; nome: string; cor: string | null }[];
  points: Array<Record<string, string | number>>;
};

export function buildMonthlyCategorySeries(
  rows: ReportRow[],
  range: DateRange,
  tipo: TransactionType,
  limit = 5,
): MonthlyCategorySeries {
  const months = monthsInRange(range);
  const categoryReport = buildCategoryReport(rows, [], tipo);
  const top = categoryReport.items.slice(0, limit);
  const topIds = new Set(top.map((item) => item.id));
  const points = new Map<string, Record<string, string | number>>(
    months.map((mes) => [mes, { mes }]),
  );

  for (const row of rows) {
    const isRefund =
      tipo === "despesa" && row.tipo === "receita" && Boolean(row.cartaoId);
    if (row.tipo !== tipo && !isRefund) continue;
    const point = points.get(row.data.slice(0, 7));
    if (!point) continue;
    const key = categoryKey(row);
    const destination = topIds.has(key) ? key : "outras";
    const sign = row.tipo === tipo ? 1 : -1;
    point[destination] = Number(point[destination] ?? 0) + sign * row.valor;
  }

  return {
    months,
    categories: top.map((item) => ({
      id: item.id,
      nome: item.nome,
      cor: item.cor,
    })),
    points: months.map((mes) => points.get(mes) as Record<string, string | number>),
  };
}


export function reportMonthLabel(range: DateRange): string {
  const start = range.from.slice(0, 7);
  const end = range.to.slice(0, 7);
  return start === end ? start : `${start} a ${end}`;
}

export function normalizeRange(from: string, to: string): DateRange | null {
  if (from > to) return null;
  const safeFrom = `${from.slice(0, 7)}-01`;
  const safeTo = `${to.slice(0, 7)}-${String(
    daysInMonth(to.slice(0, 7)),
  ).padStart(2, "0")}`;
  return { from: safeFrom, to: safeTo };
}

/** Lista de meses para o alternador de evolução (6 ou 12). */
export function evolutionRange(
  referenceMonth: string,
  months: 6 | 12,
): DateRange {
  return {
    from: dateInMonth(addMonths(referenceMonth, -(months - 1)), 1),
    to: monthRange(referenceMonth).end,
  };
}
