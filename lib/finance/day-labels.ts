import { addDaysISO, weekdayShort } from "@/lib/dates";
import { monthName } from "@/lib/format";

/** "Hoje", "Ontem", "Amanhã" ou "Sex, 7 de novembro". */
export function dayLabel(iso: string, today: string): string {
  if (iso === today) return "Hoje";
  if (iso === addDaysISO(today, -1)) return "Ontem";
  if (iso === addDaysISO(today, 1)) return "Amanhã";

  const parts = iso.split("-").map(Number);
  const month = parts[1] ?? 1;
  const day = parts[2] ?? 1;
  const weekday = weekdayShort(iso);
  const capitalized = weekday.charAt(0).toUpperCase() + weekday.slice(1);

  return `${capitalized}, ${day} de ${monthName(month)}`;
}

export type DayGroup<T> = {
  day: string;
  items: T[];
};

/** Agrupa por data (ISO), em ordem crescente de dia. */
export function groupTransactionsByDay<T extends { id: string; data: string }>(
  transactions: T[],
): DayGroup<T>[] {
  const map = new Map<string, T[]>();

  for (const transaction of transactions) {
    const list = map.get(transaction.data) ?? [];
    list.push(transaction);
    map.set(transaction.data, list);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, items]) => ({ day, items }));
}
