import { addDaysISO, monthRange } from "@/lib/dates";

export type CalendarCell = {
  iso: string;
  inMonth: boolean;
  isToday: boolean;
};

export const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/**
 * Grade fixa de 6 semanas (42 dias), começando no domingo.
 * Datas são strings ISO puras, sem deslocamento de fuso.
 */
export function buildMonthGrid(monthKey: string, today: string): CalendarCell[] {
  const { start } = monthRange(monthKey);
  const startDate = new Date(`${start}T12:00:00Z`);
  const gridStart = addDaysISO(start, -startDate.getUTCDay());

  return Array.from({ length: 42 }, (_, index) => {
    const iso = addDaysISO(gridStart, index);
    return {
      iso,
      inMonth: iso.slice(0, 7) === monthKey,
      isToday: iso === today,
    };
  });
}

export function moveDateByDays(iso: string, days: number): string {
  return addDaysISO(iso, days);
}

export function firstDayOfWeek(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return addDaysISO(iso, -date.getUTCDay());
}

export function lastDayOfWeek(iso: string): string {
  const date = new Date(`${iso}T12:00:00Z`);
  return addDaysISO(iso, 6 - date.getUTCDay());
}
