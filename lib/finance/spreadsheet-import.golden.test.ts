// Congela o comportamento aprovado pelo dono; não editar para passar.
import { describe, expect, it } from "vitest";
import {
  analyzeSpreadsheet,
  buildCanonicalRows,
  buildSheetInvoiceTotals,
  classifySpecialRow,
  type SpreadsheetSheet,
} from "./spreadsheet-import";

const CARD_SHEET: SpreadsheetSheet = {
  name: "Cartão X",
  headers: ["Data", "Descrição", "Categoria", "Valor", "Fatura"],
  rows: [
    [
      "01.11.2026",
      "Fatura Novembro 2026",
      "",
      -1_000,
      "Novembro/2026",
    ],
    ["02.11.2026", "Compra genérica", "Compras", -500, "Novembro/2026"],
    [
      "03.11.2026",
      "Estorno genérico",
      "Outras receitas",
      100,
      "Novembro/2026",
    ],
  ],
};

describe("linha-resumo Fatura <mês> <ano>", () => {
  it("classifica a linha-resumo como carry-over, não como compra", () => {
    expect(
      classifySpecialRow({
        descricao: "Fatura Novembro 2026",
        categoriaNome: null,
        valorCentavos: -100_000,
      }),
    ).toBe("carry_over");
    expect(
      classifySpecialRow({
        descricao: "Fatura dezembro de 2026",
        categoriaNome: "",
        valorCentavos: -80_000,
      }),
    ).toBe("carry_over");
    expect(
      classifySpecialRow({
        descricao: "Compra genérica",
        categoriaNome: "Compras",
        valorCentavos: -50_000,
      }),
    ).toBeNull();
  });

  it("não soma a linha-resumo no total da fatura", () => {
    const result = buildCanonicalRows([CARD_SHEET], {
      sheetKinds: { "Cartão X": "cartao" },
    });

    expect(result.rows).toHaveLength(3);
    expect(result.rows[0]?.specialKind).toBe("carry_over");
    expect(result.rows[0]?.descricao).toBe("Fatura Novembro 2026");
    expect(result.rows[0]?.faturaChave).toBe("2026-11");
    expect(result.rows[1]?.specialKind).toBeNull();
    expect(result.rows[2]?.specialKind).toBeNull();

    const totals = buildSheetInvoiceTotals(result.rows);
    expect(totals).toEqual([
      {
        sheetName: "Cartão X",
        faturaChave: "2026-11",
        totalCentavos: 40_000,
        count: 2,
      },
    ]);

    const analysis = analyzeSpreadsheet([CARD_SHEET], {
      sheetKinds: { "Cartão X": "cartao" },
    });
    expect(analysis.carryOver).toHaveLength(1);
    expect(analysis.carryOver[0]?.descricao).toBe("Fatura Novembro 2026");
    expect(analysis.totals.rows).toBe(3);
  });
});
