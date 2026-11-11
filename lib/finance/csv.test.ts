import { describe, expect, it } from "vitest";
import {
  CSV_BOM,
  escapeCsvCell,
  formatCsvDate,
  formatCsvNumber,
  toCsv,
} from "./csv";

describe("CSV", () => {
  it("gera BOM, separador ; e vírgula decimal", () => {
    const csv = toCsv(
      ["Data", "Valor"],
      [[formatCsvDate("2026-11-15"), formatCsvNumber(123456)]],
    );
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    expect(csv).toContain('"Data";"Valor"');
    expect(csv).toContain("1234,56");
  });

  it("escapa aspas e ponto e vírgula", () => {
    expect(escapeCsvCell('Mercado; "central"')).toBe('"Mercado; ""central"""');
  });

  it("protege contra CSV injection", () => {
    expect(escapeCsvCell("=SUM(A1:A2)")).toBe(`"'=SUM(A1:A2)"`);
    expect(escapeCsvCell("+1")).toBe(`"'+1"`);
    expect(escapeCsvCell("-1")).toBe(`"'-1"`);
    expect(escapeCsvCell("@cmd")).toBe(`"'@cmd"`);
  });

  it("formata datas e valores em pt-BR", () => {
    expect(formatCsvDate("2026-02-28")).toBe("28/02/2026");
    expect(formatCsvNumber(0)).toBe("0,00");
    expect(formatCsvNumber(123456)).toBe("1234,56");
  });
});
