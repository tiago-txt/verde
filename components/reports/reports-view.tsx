"use client";

import { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Download,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { ReportFiltersBar } from "./report-filters";

const chartFallback = (
  <div className="h-64 animate-pulse rounded-xl bg-muted/30" />
);
const CategoryBars = dynamic(
  () => import("./report-charts").then((module) => module.CategoryBars),
  { ssr: false, loading: () => chartFallback },
);
const MonthlyCategoryChart = dynamic(
  () =>
    import("./report-charts").then((module) => module.MonthlyCategoryChart),
  { ssr: false, loading: () => chartFallback },
);
import type { CardOption } from "@/lib/db/queries/cards";
import {
  buildReportHref,
  buildReportSearchParams,
  reportTransactionsHref,
  type ReportFilters,
} from "@/lib/finance/report-filters";
import type {
  CategoryReport,
  MonthlyCategorySeries,
  MonthlyPoint,
  OriginReport,
  ReportCategory,
} from "@/lib/finance/reports";
import { formatCurrency, formatDate, formatMonthTitle } from "@/lib/format";
import { cn } from "@/lib/utils";

type ReportAccountOption = {
  id: string;
  nome: string;
  arquivada: boolean;
  cor: string;
  icone: string;
};
type CategoryOption = {
  id: string;
  nome: string;
  tipo: "despesa" | "receita";
  icone: string;
  cor: string;
  categoriaPaiId: string | null;
  deletedAt: Date | null;
};

type ReportsViewProps = {
  filters: ReportFilters;
  categoryReport: CategoryReport;
  monthlySeries: MonthlyPoint[];
  monthlyCategorySeries: MonthlyCategorySeries;
  originReport: OriginReport;
  totals: { receitas: number; despesas: number; saldo: number };
  previousRange: { from: string; to: string };
  accounts: ReportAccountOption[];
  cards: CardOption[];
  categories: CategoryOption[];
  tags: { id: string; nome: string }[];
};

const TABS = [
  { value: "categoria" as const, label: "Por categoria" },
  { value: "mes" as const, label: "Por mês" },
  { value: "origem" as const, label: "Por conta/cartão" },
];

function Variation({
  value,
  invert = false,
}: {
  value: number | null;
  invert?: boolean;
}) {
  if (value === null) {
    return <span className="text-xs text-muted-foreground">novo</span>;
  }
  const positive = value >= 0;
  const good = invert ? !positive : positive;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        good ? "text-success" : "text-destructive",
      )}
    >
      {positive ? (
        <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {Math.abs(value).toFixed(1)}%
    </span>
  );
}

export function ReportsView({
  filters,
  categoryReport,
  monthlySeries,
  monthlyCategorySeries,
  originReport,
  totals,
  previousRange,
  accounts,
  cards,
  categories,
  tags,
}: ReportsViewProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const exportParams = buildReportSearchParams(filters);
  const exportHref = `/api/export/reports?${exportParams.toString()}`;

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">Relatórios</h1>
          <p className="text-xs text-muted-foreground">
            {formatDate(filters.range.from)} a {formatDate(filters.range.to)} ·
            comparação com {formatDate(previousRange.from)} a{" "}
            {formatDate(previousRange.to)}
          </p>
        </div>
        <Button asChild className="h-11">
          <a href={exportHref} download>
            <Download className="h-4 w-4" />
            Exportar CSV
          </a>
        </Button>
      </div>

      <ReportFiltersBar
        filters={filters}
        accounts={accounts}
        cards={cards}
        categories={categories}
        tags={tags}
      />

      <div
        role="tablist"
        aria-label="Tipo de relatório"
        className="flex w-full gap-1 overflow-x-auto rounded-md bg-muted p-1 sm:w-fit"
      >
        {TABS.map((tab) => (
          <Link
            key={tab.value}
            href={buildReportHref({ ...filters, aba: tab.value })}
            role="tab"
            aria-selected={filters.aba === tab.value}
            className={cn(
              "flex h-10 shrink-0 items-center rounded px-3 text-xs font-medium transition-colors max-sm:min-h-12",
              filters.aba === tab.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {filters.aba === "categoria" && (
        <CategoryTab
          filters={filters}
          report={categoryReport}
          expanded={expanded}
          onToggle={toggle}
        />
      )}

      {filters.aba === "mes" && (
        <MonthTab
          filters={filters}
          series={monthlySeries}
          categorySeries={monthlyCategorySeries}
          totals={totals}
        />
      )}

      {filters.aba === "origem" && (
        <OriginTab filters={filters} report={originReport} />
      )}
    </div>
  );
}

function CategoryTab({
  filters,
  report,
  expanded,
  onToggle,
}: {
  filters: ReportFilters;
  report: CategoryReport;
  expanded: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (report.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento no período.{" "}
          <Link href="/lancamentos?novo=1" className="text-primary hover:underline">
            Lançar agora
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-8">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm">
            {filters.tipo === "despesa" ? "Despesas" : "Receitas"} por categoria
          </CardTitle>
          <span className="tabular text-sm font-semibold">
            {formatCurrency(report.total)}
          </span>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm max-sm:table-fixed">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="max-sm:w-[50%] max-sm:pl-2 max-sm:pr-1 px-4 py-2 font-medium">Categoria</th>
                <th className="max-sm:w-[32%] px-2 py-2 text-right font-medium">Total</th>
                <th className="max-sm:w-[18%] px-2 py-2 text-right font-medium">%</th>
                <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                  Lanç.
                </th>
                <th className="hidden px-2 py-2 text-right font-medium md:table-cell">
                  Ticket médio
                </th>
                <th className="hidden px-4 py-2 text-right font-medium sm:table-cell">
                  Variação
                </th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => {
                const isOpen = expanded.has(item.id);
                const href = reportTransactionsHref(filters, {
                  categoriaId: item.id,
                });
                return (
                  <CategoryRows
                    key={item.id}
                    item={item}
                    filters={filters}
                    isOpen={isOpen}
                    href={href}
                    onToggle={() => onToggle(item.id)}
                  />
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-xs font-semibold">
                <td className="max-sm:pl-2 max-sm:pr-1 px-4 py-2">Total</td>
                <td className="tabular px-2 py-2 text-right">
                  {formatCurrency(report.total)}
                </td>
                <td className="px-2 py-2 text-right">100%</td>
                <td className="hidden px-2 py-2 text-right sm:table-cell">
                  {report.count}
                </td>
                <td className="hidden px-2 py-2 text-right md:table-cell">
                  {formatCurrency(report.count > 0 ? report.total / report.count : 0)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      <Card className="lg:col-span-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Distribuição</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryBars items={report.items} />
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryRows({
  item,
  filters,
  isOpen,
  href,
  onToggle,
}: {
  item: ReportCategory;
  filters: ReportFilters;
  isOpen: boolean;
  href: string;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-b border-border/60 hover:bg-accent/30">
        <td className="max-sm:pl-2 max-sm:pr-1 px-4 py-2">
          <div className="flex items-center gap-2">
            {item.children.length > 0 ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-label={`${isOpen ? "Recolher" : "Expandir"} ${item.nome}`}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-sm:h-12 max-sm:w-12"
              >
                {isOpen ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
              </button>
            ) : (
              <span className="w-8 shrink-0 max-sm:hidden" />
            )}
            <Link href={href} className="flex min-w-0 items-center gap-2 hover:underline max-sm:min-h-12">
              <CategoryIcon
                id={item.id}
                icon={item.icone}
                color={item.cor}
                className="h-6 w-6"
                iconClassName="h-3 w-3"
              />
              <span className="truncate">{item.nome}</span>
            </Link>
          </div>
        </td>
        <td className="tabular px-2 py-2 text-right font-medium">
          {formatCurrency(item.total)}
        </td>
        <td className="tabular px-2 py-2 text-right text-muted-foreground">
          {item.percent.toFixed(1)}%
        </td>
        <td className="tabular hidden px-2 py-2 text-right text-muted-foreground sm:table-cell">
          {item.count}
        </td>
        <td className="tabular hidden px-2 py-2 text-right text-muted-foreground md:table-cell">
          {formatCurrency(item.average)}
        </td>
        <td className="hidden px-4 py-2 text-right sm:table-cell">
          <Variation
            value={item.variationPercent}
            invert={filters.tipo === "despesa"}
          />
        </td>
      </tr>
      {isOpen &&
        item.children.map((child) => {
          const childHref = reportTransactionsHref(filters, {
            categoriaId: child.id,
          });
          return (
            <tr key={child.id} className="border-b border-border/40 bg-muted/10">
              <td className="py-2 pl-14 pr-4">
                <Link href={childHref} className="flex items-center gap-2 hover:underline max-sm:min-h-12">
                  <CategoryIcon
                    id={child.id}
                    icon={child.icone}
                    color={child.cor}
                    className="h-5 w-5"
                    iconClassName="h-2.5 w-2.5"
                  />
                  <span className="truncate text-xs">{child.nome}</span>
                </Link>
              </td>
              <td className="tabular px-2 py-2 text-right text-xs">
                {formatCurrency(child.total)}
              </td>
              <td className="tabular px-2 py-2 text-right text-xs text-muted-foreground">
                {child.percent.toFixed(1)}%
              </td>
              <td className="tabular hidden px-2 py-2 text-right text-xs text-muted-foreground sm:table-cell">
                {child.count}
              </td>
              <td className="tabular hidden px-2 py-2 text-right text-xs text-muted-foreground md:table-cell">
                {formatCurrency(child.average)}
              </td>
              <td className="hidden px-4 py-2 sm:table-cell" />
            </tr>
          );
        })}
    </>
  );
}

function MonthTab({
  filters,
  series,
  categorySeries,
  totals,
}: {
  filters: ReportFilters;
  series: MonthlyPoint[];
  categorySeries: MonthlyCategorySeries;
  totals: { receitas: number; despesas: number; saldo: number };
}) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            {filters.tipo === "despesa" ? "Despesas" : "Receitas"} por mês e
            categoria
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyCategoryChart series={categorySeries} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-4 py-2 font-medium">Mês</th>
                <th className="px-2 py-2 text-right font-medium">Receitas</th>
                <th className="px-2 py-2 text-right font-medium">Despesas</th>
                <th className="px-4 py-2 text-right font-medium">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {series.map((point) => (
                <tr key={point.mes} className="border-b border-border/60">
                  <td className="max-sm:pl-2 max-sm:pr-1 px-4 py-2">{formatMonthTitle(point.mes)}</td>
                  <td className="tabular px-2 py-2 text-right text-success">
                    {formatCurrency(point.receitas)}
                  </td>
                  <td className="tabular px-2 py-2 text-right text-destructive">
                    {formatCurrency(point.despesas)}
                  </td>
                  <td
                    className={cn(
                      "tabular px-4 py-2 text-right font-medium",
                      point.saldo >= 0 ? "text-success" : "text-destructive",
                    )}
                  >
                    {formatCurrency(point.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border text-xs font-semibold">
                <td className="max-sm:pl-2 max-sm:pr-1 px-4 py-2">Total</td>
                <td className="tabular px-2 py-2 text-right">
                  {formatCurrency(totals.receitas)}
                </td>
                <td className="tabular px-2 py-2 text-right">
                  {formatCurrency(totals.despesas)}
                </td>
                <td className="tabular px-4 py-2 text-right">
                  {formatCurrency(totals.saldo)}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}

function OriginTab({
  filters,
  report,
}: {
  filters: ReportFilters;
  report: OriginReport;
}) {
  if (report.items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nenhum lançamento no período.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Por conta/cartão</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="px-2 py-2 font-medium">Origem</th>
                <th className="px-2 py-2 font-medium">Tipo</th>
                <th className="px-2 py-2 text-right font-medium">Total</th>
                <th className="px-2 py-2 text-right font-medium">%</th>
                <th className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                  Lanç.
                </th>
                <th className="hidden px-2 py-2 text-right font-medium md:table-cell">
                  Ticket médio
                </th>
              </tr>
            </thead>
            <tbody>
              {report.items.map((item) => {
                const href = reportTransactionsHref(filters, {
                  contaId: item.kind === "conta" ? item.id : undefined,
                  cartaoId: item.kind === "cartao" ? item.id : undefined,
                });
                return (
                  <tr key={`${item.kind}-${item.id}`} className="border-b border-border/60">
                    <td className="px-2 py-2">
                      <Link href={href} className="flex items-center gap-2 hover:underline max-sm:min-h-12">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: item.cor ?? "hsl(var(--outline))" }}
                          aria-hidden="true"
                        />
                        <span className="truncate">{item.nome}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {item.kind === "cartao" ? "Cartão" : "Conta"}
                    </td>
                    <td className="tabular px-2 py-2 text-right font-medium">
                      {formatCurrency(item.total)}
                    </td>
                    <td className="tabular px-2 py-2 text-right text-muted-foreground">
                      {item.percent.toFixed(1)}%
                    </td>
                    <td className="tabular hidden px-2 py-2 text-right text-muted-foreground sm:table-cell">
                      {item.count}
                    </td>
                    <td className="tabular hidden px-2 py-2 text-right text-muted-foreground md:table-cell">
                      {formatCurrency(item.average)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {report.items
          .filter((item) => item.kind === "cartao" && item.faturas.length > 0)
          .map((item) => (
            <div
              key={`faturas-${item.id}`}
              className="rounded-lg border border-border p-3"
            >
              <p className="text-xs font-medium">
                {item.nome} por fatura
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {item.faturas.map((fatura) => (
                  <Badge key={fatura.chave} variant="outline">
                    {fatura.chave}: {formatCurrency(fatura.total)}
                  </Badge>
                ))}
              </div>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
