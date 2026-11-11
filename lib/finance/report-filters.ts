import { currentMonth, isValidISODate, isValidMonthKey, monthRange } from "@/lib/dates";
import { idSchema } from "@/lib/validation/common";
import {
  REPORT_PERIODS,
  REPORT_TABS,
  reportPeriodRange,
  type DateRange,
  type ReportPeriod,
  type ReportTab,
} from "./reports";

export const REPORT_TYPES = ["despesa", "receita"] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export type ReportFilters = {
  aba: ReportTab;
  periodo: ReportPeriod;
  tipo: ReportType;
  mes: string;
  de: string | null;
  ate: string | null;
  contas: string[];
  cartoes: string[];
  categorias: string[];
  tags: string[];
  onlyPaid: boolean;
  range: DateRange;
};

export type SearchParamsLike = Record<string, string | string[] | undefined>;

const MAX_IDS = 50;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function ids(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value : value ? [value] : [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of raw.flatMap((entry) => entry.split(","))) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (!idSchema.safeParse(trimmed).success) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_IDS) break;
  }
  return result;
}

export function parseReportFilters(
  params: SearchParamsLike,
  fallbackMonth = currentMonth(),
): ReportFilters {
  const abaRaw = first(params.aba);
  const aba = (REPORT_TABS as readonly string[]).includes(abaRaw ?? "")
    ? (abaRaw as ReportTab)
    : "categoria";

  const periodoRaw = first(params.periodo);
  const periodo = (REPORT_PERIODS as readonly string[]).includes(periodoRaw ?? "")
    ? (periodoRaw as ReportPeriod)
    : "mes";

  const tipoRaw = first(params.tipo);
  const tipo = (REPORT_TYPES as readonly string[]).includes(tipoRaw ?? "")
    ? (tipoRaw as ReportType)
    : "despesa";

  const mesRaw = first(params.mes);
  const mes = mesRaw && isValidMonthKey(mesRaw) ? mesRaw : fallbackMonth;

  const deRaw = first(params.de);
  const ateRaw = first(params.ate);
  const de = deRaw && isValidISODate(deRaw) ? deRaw : null;
  const ate = ateRaw && isValidISODate(ateRaw) ? ateRaw : null;

  const custom =
    periodo === "personalizado" && de && ate && de <= ate
      ? { from: de, to: ate }
      : { from: de, to: ate };

  const range = reportPeriodRange(periodo, mes, custom);

  return {
    aba,
    periodo,
    tipo,
    mes,
    de,
    ate,
    contas: ids(params.contas),
    cartoes: ids(params.cartoes),
    categorias: ids(params.categorias),
    tags: ids(params.tags),
    onlyPaid: first(params.pago) === "pagos",
    range,
  };
}

export function buildReportSearchParams(filters: ReportFilters): URLSearchParams {
  const params = new URLSearchParams();
  params.set("aba", filters.aba);
  params.set("periodo", filters.periodo);
  params.set("tipo", filters.tipo);
  params.set("mes", filters.mes);
  if (filters.periodo === "personalizado") {
    if (filters.de) params.set("de", filters.de);
    if (filters.ate) params.set("ate", filters.ate);
  }
  if (filters.contas.length) params.set("contas", filters.contas.join(","));
  if (filters.cartoes.length) params.set("cartoes", filters.cartoes.join(","));
  if (filters.categorias.length)
    params.set("categorias", filters.categorias.join(","));
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  if (filters.onlyPaid) params.set("pago", "pagos");
  return params;
}

export function buildReportHref(filters: ReportFilters): string {
  return `/relatorios?${buildReportSearchParams(filters).toString()}`;
}

/** Link para a lista de lançamentos com os mesmos filtros do relatório. */
export function reportTransactionsHref(
  filters: ReportFilters,
  options: { categoriaId?: string; cartaoId?: string; contaId?: string } = {},
): string {
  const params = new URLSearchParams();
  params.set("mes", filters.range.from.slice(0, 7));
  params.set("de", filters.range.from);
  params.set("ate", filters.range.to);
  params.set("dias", "31");
  if (filters.tipo) params.set("tipo", filters.tipo);
  const contas = options.contaId ? [options.contaId] : filters.contas;
  const cartoes = options.cartaoId ? [options.cartaoId] : filters.cartoes;
  if (contas.length) params.set("contas", contas.join(","));
  if (cartoes.length) params.set("cartoes", cartoes.join(","));
  if (options.categoriaId) params.set("categorias", options.categoriaId);
  else if (filters.categorias.length)
    params.set("categorias", filters.categorias.join(","));
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  if (filters.onlyPaid) params.set("status", "pagos");
  const accountOnly =
    Boolean(options.contaId) ||
    (filters.contas.length > 0 && filters.cartoes.length === 0);
  if (!accountOnly) params.set("compras", "1");
  return `/lancamentos?${params.toString()}`;
}

export function reportRangeLabel(range: DateRange): string {
  const start = range.from.slice(0, 7);
  const end = range.to.slice(0, 7);
  return start === end ? start : `${start} → ${end}`;
}

export function presetRange(preset: ReportPeriod, mes: string): DateRange {
  return reportPeriodRange(preset, mes);
}

export function monthBounds(mes: string): DateRange {
  const range = monthRange(mes);
  return { from: range.start, to: range.end };
}
