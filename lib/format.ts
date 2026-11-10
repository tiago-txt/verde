import { getAppTimeZone } from "@/lib/env";

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const brlCompact = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

/** Formata centavos como R$ 1.234,56. */
export function formatCurrency(cents: number): string {
  return brl.format((cents || 0) / 100);
}

/** Versão compacta para gráficos/eixos: R$ 1,2 mil. */
export function formatCurrencyCompact(cents: number): string {
  return brlCompact.format((cents || 0) / 100);
}

/** Valor absoluto formatado (usado quando o sinal já aparece na interface). */
export function formatCurrencyAbs(cents: number): string {
  return formatCurrency(Math.abs(cents));
}

/**
 * Converte texto digitado em centavos.
 * Aceita "1.234,56", "1234.56", "R$ 1234", "(10,00)" e "-10,00".
 * Retorna null para entrada inválida.
 */
export function parseCurrencyToCents(input: string | number): number | null {
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * 100) : null;
  }

  let value = input.trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
  if (!value) return null;

  const negative = value.startsWith("-") || /^\(.*\)$/.test(value);
  value = value.replace(/[()]/g, "").replace(/^-/, "");

  if (value.includes(",")) {
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/\.\d{3}(\D|$)/.test(value)) {
    value = value.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{1,2})?$/.test(value)) return null;

  const cents = Math.round(Number(value) * 100);
  return negative ? -cents : cents;
}

/** Converte centavos em string editável: 123456 -> "1234,56". */
export function centsToInput(cents: number): string {
  return (Math.abs(cents) / 100).toFixed(2).replace(".", ",");
}

/** Data ISO (YYYY-MM-DD) -> dd/MM/yyyy, sem sofrer com fuso. */
export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-");
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}/${year}`;
}

/** Timestamp -> dd/MM/yyyy HH:mm no fuso do app. */
export function formatDateTime(date: Date | number): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: getAppTimeZone(),
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

export const MONTHS_SHORT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

/** "2026-11" -> "novembro de 2026" */
export function formatMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return monthKey;
  return `${MONTHS[month - 1]} de ${year}`;
}

/** "2026-11" -> "Novembro 2026" */
export function formatMonthTitle(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return monthKey;
  const name = MONTHS[month - 1] ?? "";
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

/** "2026-11" -> "nov/26" */
export function formatMonthShort(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return monthKey;
  return `${MONTHS_SHORT[month - 1]}/${String(year).slice(2)}`;
}

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? "";
}

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}
