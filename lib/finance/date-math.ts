import { isValidISODate } from "@/lib/dates";

export type ISODateParts = {
  year: number;
  month: number;
  day: number;
};

export function parseISODate(iso: string): ISODateParts | null {
  if (!isValidISODate(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

export function formatISODate(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function daysInMonthOf(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Soma meses mantendo o dia original quando possível.
 * 31/01 + 1 mês = 28/02 (ou 29/02 em ano bissexto), mas 31/03 no mês seguinte.
 */
export function addMonthsClamped(iso: string, delta: number): string {
  const parts = parseISODate(iso);
  if (!parts) return iso;

  const totalMonths = parts.year * 12 + (parts.month - 1) + delta;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12 + 1;
  const day = Math.min(parts.day, daysInMonthOf(year, month));

  return formatISODate(year, month, day);
}

/** Soma anos preservando 29/02 quando o ano destino for bissexto. */
export function addYearsClamped(iso: string, delta: number): string {
  const parts = parseISODate(iso);
  if (!parts) return iso;

  const year = parts.year + delta;
  const day = Math.min(parts.day, daysInMonthOf(year, parts.month));

  return formatISODate(year, parts.month, day);
}
