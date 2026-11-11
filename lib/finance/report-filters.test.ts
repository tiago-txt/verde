import { describe, expect, it } from "vitest";
import {
  buildReportSearchParams,
  parseReportFilters,
  reportTransactionsHref,
} from "./report-filters";

const conta = "11111111-1111-4111-8111-111111111111";
const categoria = "33333333-3333-4333-8333-333333333333";

describe("filtros de relatório", () => {
  it("usa defaults e ignora valores inválidos", () => {
    const filters = parseReportFilters(
      {
        aba: "x",
        periodo: "x",
        tipo: "x",
        mes: "x",
        de: "x",
        ate: "x",
        contas: "x",
        categorias: "y",
      },
      "2026-11",
    );

    expect(filters.aba).toBe("categoria");
    expect(filters.periodo).toBe("mes");
    expect(filters.tipo).toBe("despesa");
    expect(filters.mes).toBe("2026-11");
    expect(filters.range).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(filters.contas).toEqual([]);
  });

  it("calcula períodos e período anterior", () => {
    const filters = parseReportFilters(
      { periodo: "3m", mes: "2026-11" },
      "2026-11",
    );
    expect(filters.range).toEqual({
      from: "2026-09-01",
      to: "2026-11-30",
    });

    const year = parseReportFilters(
      { periodo: "ano", mes: "2026-11" },
      "2026-11",
    );
    expect(year.range).toEqual({
      from: "2026-01-01",
      to: "2026-12-31",
    });
  });

  it("aceita intervalo personalizado válido e ignora invertido", () => {
    const valid = parseReportFilters(
      {
        periodo: "personalizado",
        de: "2026-10-10",
        ate: "2026-11-20",
      },
      "2026-11",
    );
    expect(valid.range).toEqual({
      from: "2026-10-10",
      to: "2026-11-20",
    });

    const inverted = parseReportFilters(
      {
        periodo: "personalizado",
        de: "2026-11-20",
        ate: "2026-10-10",
      },
      "2026-11",
    );
    expect(inverted.range).toEqual({
      from: "2026-11-01",
      to: "2026-11-30",
    });
  });

  it("faz round-trip dos parâmetros", () => {
    const filters = parseReportFilters(
      {
        aba: "origem",
        periodo: "personalizado",
        tipo: "receita",
        de: "2026-10-01",
        ate: "2026-10-31",
        contas: conta,
        categorias: categoria,
        pago: "pagos",
      },
      "2026-11",
    );
    const params = buildReportSearchParams(filters);
    const reparsed = parseReportFilters(
      Object.fromEntries(params.entries()),
      "2026-11",
    );
    expect(reparsed).toEqual(filters);
  });

  it("gera link para lançamentos com o mesmo período e filtros", () => {
    const filters = parseReportFilters(
      { periodo: "mes", mes: "2026-11", tipo: "despesa" },
      "2026-11",
    );
    const href = reportTransactionsHref(filters, { categoriaId: categoria });
    expect(href).toContain("de=2026-11-01");
    expect(href).toContain("ate=2026-11-30");
    expect(href).toContain(`categorias=${categoria}`);
    expect(href).toContain("tipo=despesa");
    expect(href).toContain("compras=1");
  });
});
