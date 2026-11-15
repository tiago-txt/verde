import { addDaysISO } from "@/lib/dates";
import { normalizeEntityName } from "./spreadsheet-import";
import { addMonthsClamped, addYearsClamped } from "./date-math";
import type { RecurrenceFrequency } from "@/lib/db/schema";

export type RecurrenceDetectionRow = {
  id: string;
  data: string;
  descricao: string;
  valorCentavos: number;
  tipo: "despesa" | "receita";
  origemNome: string;
  categoriaNome: string | null;
};

/** Formato mínimo aceito por `detectRecurrencesFromSpreadsheet`. */
export type SpreadsheetRecurrenceRow = {
  id: string;
  data: string;
  descricao: string;
  valorCentavos: number;
  tipo: string;
  origemNome: string;
  categoriaNome?: string | null;
  parcelaAtual?: number | null;
  specialKind?: string | null;
};

export type RecurrenceCandidate = {
  key: string;
  frequencia: RecurrenceFrequency;
  descricao: string;
  tipo: "despesa" | "receita";
  valorCentavos: number;
  origemNome: string;
  categoriaNome: string | null;
  rowIds: string[];
  datas: string[];
  primeiraData: string;
  ultimaData: string;
  proximaData: string;
  ocorrencias: number;
};

const FREQUENCIES: RecurrenceFrequency[] = ["mensal", "semanal", "anual"];

function expectedDate(
  start: string,
  frequencia: RecurrenceFrequency,
  index: number,
): string {
  switch (frequencia) {
    case "mensal":
      return addMonthsClamped(start, index);
    case "semanal":
      return addDaysISO(start, index * 7);
    case "anual":
      return addYearsClamped(start, index);
  }
}

function nextDate(start: string, frequencia: RecurrenceFrequency): string {
  return expectedDate(start, frequencia, 1);
}

function matchesFrequency(
  dates: string[],
  frequencia: RecurrenceFrequency,
): boolean {
  if (dates.length < 2) return false;
  const start = dates[0] as string;
  return dates.every(
    (date, index) => date === expectedDate(start, frequencia, index),
  );
}

/** Infere a frequência de uma sequência de datas. Para uma data, assume mensal. */
export function inferRecurrenceFrequency(
  dates: string[],
): RecurrenceFrequency | null {
  const unique = [...new Set(dates)].sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) return null;
  if (unique.length === 1) return "mensal";
  for (const frequencia of FREQUENCIES) {
    if (matchesFrequency(unique, frequencia)) return frequencia;
  }
  return null;
}

/**
 * Detecta séries de lançamentos com mesma origem, descrição, categoria, tipo
 * e valor, em intervalos mensais, semanais ou anuais exatos.
 *
 * Exige pelo menos 3 ocorrências e não considera linhas parceladas/especiais.
 */
export function detectRecurrences(
  rows: RecurrenceDetectionRow[],
  options: { minOccurrences?: number; maxCandidates?: number } = {},
): RecurrenceCandidate[] {
  const minOccurrences = Math.max(3, options.minOccurrences ?? 3);
  const maxCandidates = Math.max(1, options.maxCandidates ?? 5_000);

  const groups = new Map<
    string,
    {
      rows: RecurrenceDetectionRow[];
      dates: Map<string, RecurrenceDetectionRow>;
    }
  >();

  for (const row of rows) {
    if (row.valorCentavos <= 0) continue;
    const key = [
      normalizeEntityName(row.origemNome),
      row.tipo,
      row.valorCentavos,
      normalizeEntityName(row.descricao),
      normalizeEntityName(row.categoriaNome ?? ""),
    ].join("|");
    const group = groups.get(key) ?? {
      rows: [] as RecurrenceDetectionRow[],
      dates: new Map<string, RecurrenceDetectionRow>(),
    };
    group.rows.push(row);
    group.dates.set(row.data, row);
    groups.set(key, group);
  }

  const candidates: RecurrenceCandidate[] = [];

  for (const [key, group] of groups) {
    if (group.rows.length < minOccurrences) continue;
    // Duas compras iguais no mesmo dia não são uma recorrência.
    if (group.dates.size !== group.rows.length) continue;

    const entries = [...group.dates.values()].sort((a, b) =>
      a.data.localeCompare(b.data),
    );
    const dates = entries.map((row) => row.data);
    const frequencia = FREQUENCIES.find((frequency) =>
      matchesFrequency(dates, frequency),
    );
    if (!frequencia) continue;

    const latest = entries.at(-1) as RecurrenceDetectionRow;
    const first = entries[0] as RecurrenceDetectionRow;
    candidates.push({
      key,
      frequencia,
      descricao: latest.descricao,
      tipo: latest.tipo,
      valorCentavos: latest.valorCentavos,
      origemNome: latest.origemNome,
      categoriaNome: latest.categoriaNome,
      rowIds: entries.map((row) => row.id),
      datas: dates,
      primeiraData: first.data,
      ultimaData: latest.data,
      proximaData: nextDate(latest.data, frequencia),
      ocorrencias: entries.length,
    });

    if (candidates.length >= maxCandidates) break;
  }

  return candidates.sort(
    (a, b) =>
      b.ocorrencias - a.ocorrencias ||
      a.descricao.localeCompare(b.descricao) ||
      a.origemNome.localeCompare(b.origemNome),
  );
}

/**
 * Adapta as linhas normalizadas da planilha para o detector, ignorando
 * parcelas, linhas especiais, zeros e transferências.
 */
export function detectRecurrencesFromSpreadsheet(
  rows: SpreadsheetRecurrenceRow[],
): RecurrenceCandidate[] {
  return detectRecurrences(
    rows
      .filter(
        (row) =>
          row.specialKind === null &&
          row.parcelaAtual === null &&
          row.valorCentavos > 0 &&
          (row.tipo === "despesa" || row.tipo === "receita"),
      )
      .map((row) => ({
        id: row.id,
        data: row.data,
        descricao: row.descricao,
        valorCentavos: row.valorCentavos,
        tipo: row.tipo as "despesa" | "receita",
        origemNome: row.origemNome,
        categoriaNome: row.categoriaNome ?? null,
      })),
  );
}
