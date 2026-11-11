import { formatDate } from "@/lib/format";

export const CSV_SEPARATOR = ";";
export const CSV_BOM = "\uFEFF";

/**
 * Escapa uma célula CSV. Também neutraliza CSV injection prefixando `'`
 * quando o conteúdo começa com caracteres interpretados como fórmula.
 */
export function escapeCsvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : String(value);

  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function formatCsvNumber(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

export function formatCsvDate(isoDate: string): string {
  return formatDate(isoDate);
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
): string {
  return (
    CSV_BOM +
    [headers, ...rows]
      .map((row) => row.map(escapeCsvCell).join(CSV_SEPARATOR))
      .join("\r\n")
  );
}

export function csvSheetCell(value: string): string {
  return escapeCsvCell(value);
}

export function csvFileName(prefix: string, range?: { from: string; to: string }) {
  if (!range) return `${prefix}.csv`;
  return `${prefix}-${range.from}_${range.to}.csv`;
}
