import { TRANSACTION_TYPES, type TransactionType } from "@/lib/db/schema";
import { currentMonth, isValidMonthKey, monthRange } from "@/lib/dates";
import { idSchema } from "@/lib/validation/common";

export const TRANSACTION_STATUS_FILTERS = ["todos", "pagos", "nao_pagos"] as const;
export type TransactionStatusFilter =
  (typeof TRANSACTION_STATUS_FILTERS)[number];

export type TransactionFilters = {
  mes: string;
  tipo: TransactionType | null;
  contas: string[];
  categorias: string[];
  tags: string[];
  status: TransactionStatusFilter;
  q: string | null;
  dias: number;
  detalhe: string | null;
};

export type SearchParamsLike = Record<
  string,
  string | string[] | undefined
>;

const DEFAULT_DIAS = 10;
const MAX_IDS = 50;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function arrayValues(value: string | string[] | undefined): string[] {
  if (!value) return [];
  const raw = Array.isArray(value) ? value : [value];
  return raw.flatMap((item) => item.split(","));
}

function validUniqueIds(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    if (!idSchema.safeParse(trimmed).success) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_IDS) break;
  }

  return result;
}

export function parseTransactionFilters(
  params: SearchParamsLike,
  fallbackMonth: string = currentMonth(),
): TransactionFilters {
  const mesRaw = firstValue(params.mes);
  const mes =
    mesRaw && isValidMonthKey(mesRaw) ? mesRaw : fallbackMonth;

  const tipoRaw = firstValue(params.tipo);
  const tipo =
    tipoRaw && (TRANSACTION_TYPES as readonly string[]).includes(tipoRaw)
      ? (tipoRaw as TransactionType)
      : null;

  const statusRaw = firstValue(params.status);
  const status =
    statusRaw &&
    (TRANSACTION_STATUS_FILTERS as readonly string[]).includes(statusRaw)
      ? (statusRaw as TransactionStatusFilter)
      : "todos";

  const qRaw = firstValue(params.q)?.trim();
  const q = qRaw ? qRaw.slice(0, 100) : null;

  const diasRaw = Number(firstValue(params.dias));
  const dias =
    Number.isInteger(diasRaw) && diasRaw >= 1 && diasRaw <= 31
      ? diasRaw
      : DEFAULT_DIAS;

  const detalheRaw = firstValue(params.detalhe);
  const detalhe =
    detalheRaw && idSchema.safeParse(detalheRaw).success ? detalheRaw : null;

  return {
    mes,
    tipo,
    contas: validUniqueIds(arrayValues(params.contas)),
    categorias: validUniqueIds(arrayValues(params.categorias)),
    tags: validUniqueIds(arrayValues(params.tags)),
    status,
    q,
    dias,
    detalhe,
  };
}

export function hasActiveFilters(filters: TransactionFilters): boolean {
  return Boolean(
    filters.tipo ||
      filters.contas.length ||
      filters.categorias.length ||
      filters.tags.length ||
      filters.status !== "todos" ||
      filters.q,
  );
}

export function countActiveFilters(filters: TransactionFilters): number {
  let count = 0;
  if (filters.tipo) count += 1;
  if (filters.contas.length) count += 1;
  if (filters.categorias.length) count += 1;
  if (filters.tags.length) count += 1;
  if (filters.status !== "todos") count += 1;
  if (filters.q) count += 1;
  return count;
}

export function buildTransactionSearchParams(
  filters: TransactionFilters,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("mes", filters.mes);

  if (filters.tipo) params.set("tipo", filters.tipo);
  if (filters.contas.length) params.set("contas", filters.contas.join(","));
  if (filters.categorias.length)
    params.set("categorias", filters.categorias.join(","));
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  if (filters.status !== "todos") params.set("status", filters.status);
  if (filters.q) params.set("q", filters.q);
  if (filters.dias !== DEFAULT_DIAS) params.set("dias", String(filters.dias));
  if (filters.detalhe) params.set("detalhe", filters.detalhe);

  return params;
}

export function buildTransactionHref(filters: TransactionFilters): string {
  const query = buildTransactionSearchParams(filters).toString();
  return query ? `/lancamentos?${query}` : "/lancamentos";
}

export function transactionFilterRange(filters: TransactionFilters) {
  return monthRange(filters.mes);
}
