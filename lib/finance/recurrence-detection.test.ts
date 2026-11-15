import { describe, expect, it } from "vitest";
import {
  detectRecurrences,
  detectRecurrencesFromSpreadsheet,
  inferRecurrenceFrequency,
  nextRecurrenceOnOrAfter,
  type RecurrenceDetectionRow,
} from "./recurrence-detection";
import type { CanonicalSpreadsheetRow } from "./spreadsheet-import";

function row(
  id: string,
  data: string,
  overrides: Partial<RecurrenceDetectionRow> = {},
): RecurrenceDetectionRow {
  return {
    id,
    data,
    descricao: "Aluguel",
    valorCentavos: 150_000,
    tipo: "despesa",
    origemNome: "Conta",
    categoriaNome: "Casa",
    ...overrides,
  };
}

describe("detector de recorrências", () => {
  it("detecta série mensal exata", () => {
    const candidates = detectRecurrences([
      row("1", "2026-01-10"),
      row("2", "2026-02-10"),
      row("3", "2026-03-10"),
      row("4", "2026-04-10"),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      frequencia: "mensal",
      ocorrencias: 4,
      primeiraData: "2026-01-10",
      ultimaData: "2026-04-10",
      proximaData: "2026-05-10",
      rowIds: ["1", "2", "3", "4"],
    });
  });

  it("detecta semanal e anual", () => {
    expect(
      detectRecurrences([
        row("1", "2026-01-05"),
        row("2", "2026-01-12"),
        row("3", "2026-01-19"),
      ])[0]?.frequencia,
    ).toBe("semanal");

    expect(
      detectRecurrences([
        row("1", "2024-03-01"),
        row("2", "2025-03-01"),
        row("3", "2026-03-01"),
      ])[0]?.frequencia,
    ).toBe("anual");
  });

  it("exige pelo menos três ocorrências", () => {
    expect(
      detectRecurrences([row("1", "2026-01-10"), row("2", "2026-02-10")]),
    ).toHaveLength(0);
  });

  it("não mistura valores, descrições ou origens diferentes", () => {
    expect(
      detectRecurrences([
        row("1", "2026-01-10"),
        row("2", "2026-02-10", { valorCentavos: 150_001 }),
        row("3", "2026-03-10"),
      ]),
    ).toHaveLength(0);

    expect(
      detectRecurrences([
        row("1", "2026-01-10"),
        row("2", "2026-02-10", { descricao: "Outro" }),
        row("3", "2026-03-10"),
      ]),
    ).toHaveLength(0);
  });

  it("ignora datas repetidas", () => {
    expect(
      detectRecurrences([
        row("1", "2026-01-10"),
        row("2", "2026-02-10"),
        row("3", "2026-02-10"),
        row("4", "2026-03-10"),
      ]),
    ).toHaveLength(0);
  });

  it("infere a frequência das datas", () => {
    expect(
      inferRecurrenceFrequency(["2026-01-10", "2026-02-10", "2026-03-10"]),
    ).toBe("mensal");
    expect(inferRecurrenceFrequency(["2026-01-10"])).toBe("mensal");
    expect(inferRecurrenceFrequency(["2026-01-10", "2026-07-10"])).toBeNull();
  });

  it("ignora parcelas, especiais e transferências na planilha", () => {
    const base = {
      id: "1",
      sheetName: "Conta",
      sheetKind: "conta" as const,
      sourceRow: 2,
      data: "2026-01-10",
      descricao: "Aluguel",
      valorCentavos: 150_000,
      tipo: "despesa" as const,
      categoriaNome: "Casa",
      pago: true,
      origemNome: "Conta",
      faturaChave: null,
      cartaoNome: null,
      tags: [],
      observacao: null,
      parcelaAtual: null,
      parcelaTotal: null,
      parcelaGrupoId: null,
      specialKind: null,
      warnings: [],
      duplicateKey: "",
    } satisfies CanonicalSpreadsheetRow;
    const rows: CanonicalSpreadsheetRow[] = [
      base,
      { ...base, id: "2", sourceRow: 3, data: "2026-02-10" },
      { ...base, id: "3", sourceRow: 4, data: "2026-03-10" },
      {
        ...base,
        id: "4",
        sourceRow: 5,
        data: "2026-04-10",
        parcelaAtual: 4,
        parcelaTotal: 4,
        parcelaGrupoId: "grupo",
      },
      {
        ...base,
        id: "5",
        sourceRow: 6,
        data: "2026-05-10",
        specialKind: "carry_over",
      },
    ];
    const candidates = detectRecurrencesFromSpreadsheet(rows);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.rowIds).toEqual(["1", "2", "3"]);
  });
});

describe("início da série a partir de hoje", () => {
  it("avança a série antiga até a próxima ocorrência a partir da referência", () => {
    expect(nextRecurrenceOnOrAfter("2022-08-10", "mensal", "2026-11-10")).toBe(
      "2026-11-10",
    );
    expect(nextRecurrenceOnOrAfter("2022-08-10", "mensal", "2026-11-15")).toBe(
      "2026-12-10",
    );
    expect(nextRecurrenceOnOrAfter("2026-01-05", "semanal", "2026-01-20")).toBe(
      "2026-01-26",
    );
    expect(nextRecurrenceOnOrAfter("2022-03-01", "anual", "2026-11-15")).toBe(
      "2027-03-01",
    );
    expect(nextRecurrenceOnOrAfter("2024-01-31", "mensal", "2024-03-01")).toBe(
      "2024-03-31",
    );
  });

  it("mantém a própria data quando a última ocorrência já é futura", () => {
    expect(nextRecurrenceOnOrAfter("2026-12-10", "mensal", "2026-11-15")).toBe(
      "2026-12-10",
    );
  });
});
