import {
  formatCsvNumber,
  toCsv,
} from "./csv";
import type {
  CategoryReport,
  MonthlyPoint,
  OriginReport,
} from "./reports";
import type { ReportTab } from "./reports";

function percent(value: number): string {
  return `${value.toFixed(1).replace(".", ",")}%`;
}

function variation(value: number | null): string {
  if (value === null) return "novo";
  return percent(value);
}

export function buildCategoryCsv(report: CategoryReport): string {
  const rows: Array<Array<string | number | null | undefined>> = [];
  for (const item of report.items) {
    rows.push([
      item.nome,
      "",
      formatCsvNumber(item.total),
      percent(item.percent),
      item.count,
      formatCsvNumber(item.average),
      variation(item.variationPercent),
    ]);
    for (const child of item.children) {
      rows.push([
        item.nome,
        child.nome,
        formatCsvNumber(child.total),
        percent(child.percent),
        child.count,
        formatCsvNumber(child.average),
        "",
      ]);
    }
  }
  rows.push([
    "Total",
    "",
    formatCsvNumber(report.total),
    "100,0%",
    report.count,
    formatCsvNumber(report.count > 0 ? report.total / report.count : 0),
    "",
  ]);

  return toCsv(
    [
      "Categoria",
      "Subcategoria",
      "Total (R$)",
      "% do total",
      "Lançamentos",
      "Ticket médio (R$)",
      "Variação",
    ],
    rows,
  );
}

export function buildMonthlyCsv(series: MonthlyPoint[]): string {
  const rows = series.map((point) => [
    point.mes,
    formatCsvNumber(point.receitas),
    formatCsvNumber(point.despesas),
    formatCsvNumber(point.saldo),
  ]);
  const totals = series.reduce(
    (acc, point) => ({
      receitas: acc.receitas + point.receitas,
      despesas: acc.despesas + point.despesas,
      saldo: acc.saldo + point.saldo,
    }),
    { receitas: 0, despesas: 0, saldo: 0 },
  );
  rows.push([
    "Total",
    formatCsvNumber(totals.receitas),
    formatCsvNumber(totals.despesas),
    formatCsvNumber(totals.saldo),
  ]);

  return toCsv(["Mês", "Receitas (R$)", "Despesas (R$)", "Saldo (R$)"], rows);
}

export function buildOriginCsv(report: OriginReport): string {
  const rows: Array<Array<string | number | null | undefined>> = [];
  for (const item of report.items) {
    rows.push([
      item.nome,
      item.kind === "cartao" ? "Cartão" : "Conta",
      formatCsvNumber(item.total),
      percent(item.percent),
      item.count,
      formatCsvNumber(item.average),
    ]);
    for (const fatura of item.faturas) {
      rows.push([
        `${item.nome} · fatura ${fatura.chave}`,
        "Fatura",
        formatCsvNumber(fatura.total),
        "",
        "",
        "",
      ]);
    }
  }
  rows.push([
    "Total",
    "",
    formatCsvNumber(report.total),
    "100,0%",
    report.count,
    formatCsvNumber(report.count > 0 ? report.total / report.count : 0),
  ]);

  return toCsv(
    [
      "Origem",
      "Tipo",
      "Total (R$)",
      "% do total",
      "Lançamentos",
      "Ticket médio (R$)",
    ],
    rows,
  );
}

export function buildReportCsv(
  tab: ReportTab,
  data: {
    categoryReport: CategoryReport;
    monthlySeries: MonthlyPoint[];
    originReport: OriginReport;
  },
): string {
  if (tab === "mes") return buildMonthlyCsv(data.monthlySeries);
  if (tab === "origem") return buildOriginCsv(data.originReport);
  return buildCategoryCsv(data.categoryReport);
}
