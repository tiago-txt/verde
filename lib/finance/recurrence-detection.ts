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
  /** Valor da ocorrência mais recente, usado no modelo da série. */
  valorCentavos: number;
  valorMinimo: number;
  valorMaximo: number;
  origemNome: string;
  categoriaNome: string | null;
  rowIds: string[];
  datas: string[];
  primeiraData: string;
  ultimaData: string;
  proximaData: string;
  ocorrencias: number;
};

// Anual antes de mensal: uma série de 12 em 12 meses também caberia na grade
// mensal com saltos, mas o intervalo anual é a leitura mais específica.
const FREQUENCIES: RecurrenceFrequency[] = ["anual", "mensal", "semanal"];

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

function monthDifference(start: string, date: string): number | null {
  const startParts = start.split("-").map(Number);
  const dateParts = date.split("-").map(Number);
  if (startParts.length !== 3 || dateParts.length !== 3) return null;
  return (
    ((dateParts[0] ?? 0) - (startParts[0] ?? 0)) * 12 +
    ((dateParts[1] ?? 0) - (startParts[1] ?? 0))
  );
}

function dayDifference(start: string, date: string): number | null {
  const startTime = new Date(`${start}T12:00:00Z`).getTime();
  const dateTime = new Date(`${date}T12:00:00Z`).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(dateTime)) return null;
  return Math.round((dateTime - startTime) / 86_400_000);
}

/**
 * Aceita séries com meses/ocorrências faltando, desde que todas as datas
 * caibam na mesma grade da frequência. É o que permite reconhecer despesas
 * mensais que variam de valor ou que tiveram um mês sem lançamento.
 */
function consecutiveDifferences(
  dates: string[],
  measure: (previous: string, current: string) => number | null,
): number[] | null {
  const differences: number[] = [];
  for (let index = 1; index < dates.length; index += 1) {
    const previous = dates[index - 1] as string;
    const current = dates[index] as string;
    const difference = measure(previous, current);
    if (difference === null || difference <= 0) return null;
    differences.push(difference);
  }
  return differences;
}

function hasCadence(differences: number[], expectedStep: number): boolean {
  // Aceita falhas pontuais (um período sem lançamento), mas não uma série
  // trimestral/bimestral disfarçada de mensal.
  const exact = differences.filter((value) => value === expectedStep).length;
  return exact / differences.length >= 0.6;
}

function matchesFrequencyAllowingGaps(
  dates: string[],
  frequencia: RecurrenceFrequency,
): boolean {
  if (dates.length < 2) return false;
  const start = dates[0] as string;

  const onGrid = dates.every((date, index) => {
    if (index === 0) return true;
    switch (frequencia) {
      case "mensal": {
        const months = monthDifference(start, date);
        return (
          months !== null &&
          months > 0 &&
          date === expectedDate(start, frequencia, months)
        );
      }
      case "semanal": {
        const days = dayDifference(start, date);
        return (
          days !== null &&
          days > 0 &&
          days % 7 === 0 &&
          date === expectedDate(start, frequencia, days / 7)
        );
      }
      case "anual": {
        const years = (Number(date.slice(0, 4)) -
          Number(start.slice(0, 4))) as number;
        return years > 0 && date === expectedDate(start, frequencia, years);
      }
    }
  });
  if (!onGrid) return false;

  const differences = consecutiveDifferences(
    dates,
    frequencia === "mensal"
      ? monthDifference
      : frequencia === "semanal"
        ? dayDifference
        : (previous, current) =>
            Number(current.slice(0, 4)) - Number(previous.slice(0, 4)),
  );
  if (!differences) return false;
  return hasCadence(
    differences,
    frequencia === "semanal" ? 7 : 1,
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
 * Primeira ocorrência da série que cai em `referenceDate` ou depois.
 * Parte da primeira ocorrência para não começar no fim de uma série longa.
 */
export function firstRecurrenceOnOrAfter(
  firstDate: string,
  frequencia: RecurrenceFrequency,
  referenceDate: string,
): string {
  for (let index = 0; index < 2_000; index += 1) {
    const candidate = expectedDate(firstDate, frequencia, index);
    if (candidate >= referenceDate) return candidate;
  }
  return firstDate;
}

/**
 * Detecta séries de lançamentos com mesma origem, descrição, categoria e tipo,
 * em intervalos mensais, semanais ou anuais. Valores podem variar e pode haver
 * meses sem lançamento; a série usa o valor da ocorrência mais recente como
 * modelo para as próximas.
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
      matchesFrequencyAllowingGaps(dates, frequency),
    );
    if (!frequencia) continue;

    const latest = entries.at(-1) as RecurrenceDetectionRow;
    const first = entries[0] as RecurrenceDetectionRow;
    const values = entries.map((row) => row.valorCentavos);
    candidates.push({
      key,
      frequencia,
      descricao: latest.descricao,
      tipo: latest.tipo,
      valorCentavos: latest.valorCentavos,
      valorMinimo: Math.min(...values),
      valorMaximo: Math.max(...values),
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
