import { getAppTimeZone } from "@/lib/env";

/** Data de hoje (fuso do app) no formato YYYY-MM-DD. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getAppTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Mês atual no formato YYYY-MM. */
export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

export function isValidMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Soma (ou subtrai) meses de uma chave YYYY-MM. */
export function addMonths(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

export function addDaysISO(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(monthKey: string): number {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return 30;
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Primeiro e último dia do mês, em ISO. */
export function monthRange(monthKey: string): { start: string; end: string } {
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, "0")}`,
  };
}

/** Lista todos os dias do mês em ISO. */
export function eachDayOfMonth(monthKey: string): string[] {
  const total = daysInMonth(monthKey);
  return Array.from(
    { length: total },
    (_, index) => `${monthKey}-${String(index + 1).padStart(2, "0")}`,
  );
}

/**
 * Cria uma data no formato ISO respeitando o dia do mês.
 * Ex.: dia 31 em fevereiro vira o último dia de fevereiro.
 */
export function dateInMonth(monthKey: string, day: number): string {
  const total = daysInMonth(monthKey);
  const safeDay = Math.min(Math.max(day, 1), total);
  return `${monthKey}-${String(safeDay).padStart(2, "0")}`;
}

/** Intervalo [inicio, fim] em ISO, inclusivo. */
export function rangeBetween(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  // Guarda contra intervalos absurdos.
  for (let i = 0; i < 3660 && cursor <= end; i += 1) {
    days.push(cursor);
    cursor = addDaysISO(cursor, 1);
  }
  return days;
}

export function weekdayShort(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    timeZone: "UTC",
  })
    .format(date)
    .replace(".", "");
}
