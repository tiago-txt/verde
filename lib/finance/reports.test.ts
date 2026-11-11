import { describe, expect, it } from "vitest";
import {
  buildCategoryReport,
  buildMonthlySeries,
  buildOriginReport,
  buildTopCategories,
  filterReportRows,
  monthsInRange,
  percentChange,
  previousEquivalentRange,
  rowsInRange,
  type ReportRow,
} from "./reports";

function row(patch: Partial<ReportRow> & Pick<ReportRow, "valor" | "data">): ReportRow {
  return {
    tipo: "despesa",
    pago: true,
    categoriaId: "mercado",
    categoriaNome: "Mercado",
    categoriaPaiId: null,
    categoriaPaiNome: null,
    categoriaPaiIcone: null,
    categoriaPaiCor: null,
    categoriaIcone: "ShoppingCart",
    categoriaCor: "#84cc16",
    contaId: "conta-1",
    contaNome: "Conta",
    cartaoId: null,
    cartaoNome: null,
    cartaoCor: null,
    cartaoIcone: null,
    faturaChave: null,
    ...patch,
  };
}

const childRow = (data: string, valor: number): ReportRow =>
  row({
    data,
    valor,
    categoriaId: "mercado-filho",
    categoriaNome: "Feira",
    categoriaPaiId: "mercado",
    categoriaPaiNome: "Mercado",
    categoriaPaiIcone: "ShoppingCart",
    categoriaPaiCor: "#84cc16",
  });

describe("totais por categoria", () => {
  const rows = [
    row({ data: "2026-11-01", valor: 30_000 }),
    childRow("2026-11-02", 10_000),
    row({ data: "2026-11-03", valor: 5_000, categoriaId: "lazer", categoriaNome: "Lazer" }),
    row({ data: "2026-11-04", valor: 20_000, tipo: "receita" }),
    row({ data: "2026-11-05", valor: 99_999, tipo: "transferencia" }),
  ];

  it("soma subcategorias no pai e ignora receitas/transferências", () => {
    const report = buildCategoryReport(rows, [], "despesa");

    expect(report.total).toBe(45_000);
    expect(report.count).toBe(3);
    expect(report.items[0]).toMatchObject({
      id: "mercado",
      nome: "Mercado",
      total: 40_000,
      count: 2,
      average: 20_000,
    });
    expect(report.items[0]?.children[0]).toMatchObject({
      id: "mercado-filho",
      total: 10_000,
      count: 1,
    });
    expect(report.items[1]).toMatchObject({ id: "lazer", total: 5_000 });
  });

  it("calcula percentual e variação contra o período anterior", () => {
    const current = [row({ data: "2026-11-01", valor: 20_000 })];
    const previous = [row({ data: "2026-10-01", valor: 10_000 })];
    const report = buildCategoryReport(current, previous, "despesa");

    expect(report.items[0]?.percent).toBe(100);
    expect(report.items[0]?.variationPercent).toBe(100);
  });

  it("trata divisão por zero na variação", () => {
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(10, 0)).toBeNull();
    expect(percentChange(10, 20)).toBe(-50);
  });

  it("estorno no cartão reduz a categoria", () => {
    const report = buildCategoryReport(
      [
        row({
          data: "2026-11-01",
          valor: 20_000,
          cartaoId: "card",
          contaId: null,
        }),
        row({
          data: "2026-11-02",
          valor: 5_000,
          tipo: "receita",
          cartaoId: "card",
          contaId: null,
        }),
      ],
      [],
      "despesa",
    );
    expect(report.total).toBe(15_000);
  });

  it("total do relatório é a soma das categorias e do top N", () => {
    const report = buildCategoryReport(rows, [], "despesa");
    const sum = report.items.reduce((total, item) => total + item.total, 0);
    expect(sum).toBe(report.total);

    const top = buildTopCategories(rows, "despesa", 1);
    expect(top.total).toBe(report.total);
    expect(top.items.reduce((total, item) => total + item.total, 0)).toBe(
      report.total,
    );
    expect(top.items.at(-1)).toMatchObject({ id: "outras", total: 5_000 });
  });
});

describe("filtros e período", () => {
  const rows = [
    row({ data: "2026-11-01", valor: 10_000, pago: true }),
    row({ data: "2026-11-02", valor: 20_000, pago: false }),
    row({ data: "2026-10-01", valor: 30_000, pago: true }),
  ];

  it("filtra por pagos e ignora transferências", () => {
    expect(filterReportRows(rows, { onlyPaid: true })).toHaveLength(2);
    expect(
      filterReportRows(
        [row({ data: "2026-11-01", valor: 1_000, tipo: "transferencia" })],
        {},
      ),
    ).toHaveLength(0);
  });

  it("aplica intervalo inclusivo", () => {
    expect(
      rowsInRange(rows, { from: "2026-11-01", to: "2026-11-30" }),
    ).toHaveLength(2);
  });

  it("calcula período anterior equivalente", () => {
    expect(
      previousEquivalentRange({ from: "2026-11-01", to: "2026-11-30" }),
    ).toEqual({ from: "2026-10-02", to: "2026-10-31" });
  });
});

describe("série mensal", () => {
  it("agrupa por mês, atravessa anos e preenche meses sem movimento", () => {
    const series = buildMonthlySeries(
      [
        row({ data: "2026-12-31", valor: 10_000 }),
        row({ data: "2027-01-01", valor: 20_000, tipo: "receita" }),
        row({ data: "2027-02-28", valor: 5_000 }),
      ],
      { from: "2026-06-01", to: "2027-02-28" },
    );

    expect(series.map((point) => point.mes)).toEqual([
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
    expect(series.at(-3)).toMatchObject({
      mes: "2026-12",
      despesas: 10_000,
      saldo: -10_000,
    });
    expect(series.at(-2)).toMatchObject({
      mes: "2027-01",
      receitas: 20_000,
      saldo: 20_000,
    });
    expect(series.at(-1)).toMatchObject({ mes: "2027-02", despesas: 5_000 });
  });

  it("não migra um lançamento do dia 31 para outro mês", () => {
    const series = buildMonthlySeries(
      [row({ data: "2026-01-31", valor: 1_000 })],
      { from: "2026-01-01", to: "2026-02-28" },
    );
    expect(series[0]?.despesas).toBe(1_000);
    expect(series[1]?.despesas).toBe(0);
  });

  it("lista meses de um intervalo", () => {
    expect(monthsInRange({ from: "2026-11-15", to: "2027-02-01" })).toEqual([
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ]);
  });
});

describe("origem e cartão", () => {
  it("agrupa conta e cartão e separa faturas", () => {
    const report = buildOriginReport(
      [
        row({ data: "2026-11-01", valor: 10_000 }),
        row({
          data: "2026-11-15",
          valor: 20_000,
          contaId: null,
          cartaoId: "card-1",
          cartaoNome: "Nu",
          cartaoCor: "#a855f7",
          cartaoIcone: "CreditCard",
          faturaChave: "2026-12",
        }),
        row({
          data: "2026-12-12",
          valor: 5_000,
          contaId: null,
          cartaoId: "card-1",
          cartaoNome: "Nu",
          cartaoCor: "#a855f7",
          cartaoIcone: "CreditCard",
          faturaChave: "2027-01",
        }),
      ],
      "despesa",
    );

    expect(report.total).toBe(35_000);
    const card = report.items.find((item) => item.kind === "cartao");
    expect(card).toMatchObject({ nome: "Nu", total: 25_000, count: 2 });
    expect(card?.faturas).toEqual([
      { chave: "2026-12", total: 20_000 },
      { chave: "2027-01", total: 5_000 },
    ]);
  });

  it("compra no cartão é agrupada pela data da compra, não pelo vencimento", () => {
    const series = buildMonthlySeries(
      [
        row({
          data: "2026-11-15",
          valor: 20_000,
          contaId: null,
          cartaoId: "card-1",
          faturaChave: "2026-12",
        }),
      ],
      { from: "2026-11-01", to: "2026-12-31" },
    );
    expect(series[0]?.despesas).toBe(20_000);
    expect(series[1]?.despesas).toBe(0);
  });
});
