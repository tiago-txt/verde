import { addDaysISO } from "@/lib/dates";
import type { RecurrenceFrequency } from "@/lib/db/schema";
import { addMonthsClamped, addYearsClamped, parseISODate } from "./date-math";

export type RecurrenceSpec = {
  frequencia: RecurrenceFrequency;
  dataInicio: string;
  dataFim?: string | null;
  /** Limite opcional (inclusivo), usado para gerar só até um horizonte. */
  until?: string | null;
  maxOccurrences?: number;
};

function earliestLimit(
  dataFim: string | null | undefined,
  until: string | null | undefined,
): string | null {
  const limits = [dataFim, until].filter(
    (value): value is string => Boolean(value) && parseISODate(value as string) !== null,
  );
  if (limits.length === 0) return null;
  return limits.sort()[0] ?? null;
}

/**
 * Datas de ocorrência de uma recorrência, inclusive `dataInicio` e os limites.
 * A conta é sempre feita a partir da data original para não "derivar" o dia
 * (31/01 → 28/02 → 31/03, e não 28/03).
 */
export function generateRecurrenceDates(spec: RecurrenceSpec): string[] {
  if (!parseISODate(spec.dataInicio)) return [];

  const limit = earliestLimit(spec.dataFim, spec.until);
  if (limit && limit < spec.dataInicio) return [];

  const max = Math.min(Math.max(spec.maxOccurrences ?? 1000, 1), 5000);
  const dates: string[] = [];

  for (let index = 0; index < max; index += 1) {
    let date: string;

    switch (spec.frequencia) {
      case "mensal":
        date = addMonthsClamped(spec.dataInicio, index);
        break;
      case "semanal":
        date = addDaysISO(spec.dataInicio, index * 7);
        break;
      case "anual":
        date = addYearsClamped(spec.dataInicio, index);
        break;
    }

    if (limit && date > limit) break;

    dates.push(date);
    if (limit && date === limit) break;
  }

  return dates;
}

/**
 * Retorna apenas as datas que ainda não existem.
 * É a parte pura da geração idempotente usada pelas Server Actions.
 */
export function planRecurrenceOccurrences(
  spec: RecurrenceSpec,
  existingDates: Iterable<string>,
): string[] {
  const existing = new Set(existingDates);
  return generateRecurrenceDates(spec).filter((date) => !existing.has(date));
}

/**
 * Horizonte de geração: fim do mês visualizado ou pelo menos 12 meses à frente
 * do mês atual, o que for maior.
 */
export function recurrenceHorizon(monthKey: string, today: string): string {
  const viewedEnd = endOfMonth(monthKey);
  const currentMonth = today.slice(0, 7);
  const aheadEnd = endOfMonth(addMonthsKey(currentMonth, 12));
  return viewedEnd > aheadEnd ? viewedEnd : aheadEnd;
}

function endOfMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return `${monthKey}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${monthKey}-${String(lastDay).padStart(2, "0")}`;
}

function addMonthsKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) return monthKey;
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
