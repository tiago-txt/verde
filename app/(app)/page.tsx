import { Suspense } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CreditCard,
  Leaf,
  Plus,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BlockBoundary } from "@/components/dashboard/block-boundary";
import { DashboardMonthHeader } from "@/components/dashboard/month-header";
import { CategoryDonut, EvolutionChart } from "@/components/dashboard/report-charts";
import { DashboardSkeleton } from "@/components/dashboard/skeleton";
import { BudgetCycleOverview } from "@/components/budgets/budget-cycle-overview";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import { UpcomingBlock } from "@/components/dashboard/upcoming-block";
import { ForecastMiniCard } from "@/components/forecast/forecast-mini-card";
import { requireUser } from "@/lib/auth/current-user";
import { listBudgetCycleDetails } from "@/lib/db/queries/budgets";
import { getForecastData } from "@/lib/db/queries/forecast";
import {
  getDashboardBalance,
  getDashboardCards,
  getDashboardMonth,
  getDashboardUpcoming,
} from "@/lib/db/queries/dashboard";
import { monthRange, isValidMonthKey, currentMonth, todayISO } from "@/lib/dates";
import { reportTransactionsHref, type ReportFilters } from "@/lib/finance/report-filters";
import { formatCurrency, formatDate, formatMonthTitle } from "@/lib/format";

export const metadata = { title: "Visão geral" };

function monthFromParams(
  params: Record<string, string | string[] | undefined>,
): string {
  const raw = Array.isArray(params.mes) ? params.mes[0] : params.mes;
  return raw && isValidMonthKey(raw) ? raw : currentMonth();
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const month = monthFromParams(params);
  const firstName = user.nome.split(/\s+/)[0] ?? user.nome;
  const workspaceId = user.workspaceId;

  return (
    <div className="space-y-4">
      <section className="relative overflow-hidden rounded-lg border border-grout bg-surface-low p-5 shadow-[0_20px_48px_-24px_rgba(7,16,11,0.9)] sm:p-6">
        <div
          aria-hidden="true"
          className="decor-pattern azulejo absolute inset-0 opacity-[0.2]"
        />
        <div
          aria-hidden="true"
          className="decor-glow pointer-events-none absolute -right-20 -top-20 h-80 w-80 rounded-full bg-emerald/10 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="decor-glow pointer-events-none absolute -bottom-24 left-1/3 h-72 w-72 rounded-full bg-forest-highest/40 blur-3xl"
        />
        <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.08em] text-primary">
              <span className="grid h-6 w-6 place-items-center rounded bg-primary-fill text-primary-fill-foreground shadow-[0_0_12px_hsl(var(--primary)/.35)]">
                <Leaf className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              Painel financeiro
            </p>
            <h1 className="font-display text-[34px] font-bold leading-[42px] tracking-tight sm:text-[48px] sm:leading-[56px]">
              Olá, {firstName}
            </h1>
            <p className="flex flex-wrap items-center gap-2 text-[15px] leading-[22px] text-on-surface/80">
              Resumo de{" "}
              <span className="rounded border border-grout bg-forest-high px-2 py-0.5 font-mono text-xs uppercase tracking-[0.08em] text-primary">
                {formatMonthTitle(month)}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" className="h-12 sm:h-10">
              <Link href="/relatorios">
                <BarChart3 className="h-4 w-4 text-amber" />
                Relatórios
              </Link>
            </Button>
            <Button asChild className="h-12 sm:h-10">
              <Link href="/lancamentos?novo=1">
                <Plus className="h-4 w-4 transition-transform hover:rotate-90" />
                Novo lançamento
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <DashboardMonthHeader month={month} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="order-1 lg:col-span-4">
          <Suspense fallback={<DashboardSkeleton lines={4} />}>
            <BlockBoundary label="o saldo">
              <BalanceBlock workspaceId={workspaceId} month={month} />
            </BlockBoundary>
          </Suspense>
        </div>

        <div className="order-2 lg:col-span-8">
          <Suspense fallback={<DashboardSkeleton lines={4} />}>
            <BlockBoundary label="o resumo do mês">
              <MonthBlock month={month} workspaceId={workspaceId} />
            </BlockBoundary>
          </Suspense>
        </div>

        <div className="order-3 lg:col-span-5">
          <Suspense fallback={<DashboardSkeleton lines={5} />}>
            <BlockBoundary label="os próximos vencimentos">
              <UpcomingServerBlock workspaceId={workspaceId} />
            </BlockBoundary>
          </Suspense>
        </div>

        <div className="order-4 lg:col-span-7">
          <Suspense fallback={<DashboardSkeleton lines={7} />}>
            <BlockBoundary label="o gráfico de categorias">
              <CategoryBlock month={month} workspaceId={workspaceId} />
            </BlockBoundary>
          </Suspense>
        </div>

        <div className="order-5 lg:col-span-4">
          <Suspense fallback={<DashboardSkeleton lines={4} />}>
            <BlockBoundary label="os orçamentos">
              <BudgetsBlock month={month} workspaceId={workspaceId} />
            </BlockBoundary>
          </Suspense>
        </div>

        <div className="order-6 lg:col-span-3">
          <Suspense fallback={<DashboardSkeleton lines={5} />}>
            <BlockBoundary label="os cartões">
              <CardsBlock workspaceId={workspaceId} />
            </BlockBoundary>
          </Suspense>
        </div>

        <div className="order-7 lg:col-span-5">
          <Suspense fallback={<DashboardSkeleton lines={6} />}>
            <BlockBoundary label="a evolução mensal">
              <EvolutionBlock month={month} workspaceId={workspaceId} />
            </BlockBoundary>
          </Suspense>
        </div>

        {/* Etapa 6: previsão de saldo. */}
        <div className="order-8 lg:col-span-5">
          <Suspense fallback={<DashboardSkeleton lines={4} />}>
            <BlockBoundary label="a previsão">
              <ForecastBlock userId={user.id} workspaceId={workspaceId} />
            </BlockBoundary>
          </Suspense>
        </div>
      </div>
    </div>
  );
}

async function BalanceBlock({
  workspaceId,
  month,
}: {
  workspaceId: string;
  month: string;
}) {
  const data = await getDashboardBalance(workspaceId);
  const previsto = data.accounts
    .filter(
      (account) =>
        !account.deletedAt &&
        account.tipo !== "investimento" &&
        !account.arquivada,
    )
    .reduce((sum, account) => sum + account.saldoPrevisto, 0);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <span className="tile grid h-8 w-8 place-items-center rounded-[12px] border border-grout bg-forest-container text-primary">
            <Wallet className="h-4 w-4" aria-hidden="true" />
          </span>
          Saldo atual
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="tabular text-[28px] font-semibold leading-[34px]">
          {formatCurrency(data.operational)}
        </p>
        <dl className="space-y-1 text-xs text-muted-foreground">
          <div className="flex justify-between gap-2">
            <dt>Previsto até fim de {formatMonthTitle(month)}</dt>
            <dd className="tabular">{formatCurrency(previsto)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Investimentos (separado)</dt>
            <dd className="tabular">{formatCurrency(data.investments)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt>Faturas em aberto</dt>
            <dd className="tabular text-amber">
              {formatCurrency(data.cardDebt)}
            </dd>
          </div>
        </dl>
        <Button asChild variant="outline" size="sm" className="h-11 w-full sm:h-9">
          <Link href="/contas">
            Ver contas
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

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
      className={
        good
          ? "inline-flex items-center gap-0.5 text-xs font-medium text-success"
          : "inline-flex items-center gap-0.5 text-xs font-medium text-destructive"
      }
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

async function MonthBlock({
  month,
  workspaceId,
}: {
  month: string;
  workspaceId: string;
}) {
  const data = await getDashboardMonth(workspaceId, month);
  const { current, previous, expenseVariation, incomeVariation } = data;

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Receitas × despesas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <div className="relative overflow-hidden rounded-lg border border-grout bg-forest-container/60 p-3">
            <span className="absolute inset-x-0 top-0 h-1 bg-emerald" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Receitas</p>
            <p className="tabular text-lg font-semibold text-primary">
              {formatCurrency(current.receitas)}
            </p>
            <Variation value={incomeVariation} />
          </div>
          <div className="relative overflow-hidden rounded-lg border border-grout bg-forest-container/60 p-3">
            <span className="absolute inset-x-0 top-0 h-1 bg-clay" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Despesas</p>
            <p className="tabular text-lg font-semibold text-clay">
              {formatCurrency(current.despesas)}
            </p>
            <Variation value={expenseVariation} invert />
          </div>
          <div className="relative col-span-2 overflow-hidden rounded-lg border border-grout bg-forest-container/60 p-3 sm:col-span-1">
            <span className="absolute inset-x-0 top-0 h-1 bg-primary" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">Saldo do mês</p>
            <p
              className={`tabular text-lg font-semibold ${
                current.saldo >= 0 ? "text-primary" : "text-clay"
              }`}
            >
              {formatCurrency(current.saldo)}
            </p>
            <p className="text-xs text-muted-foreground">
              anterior: {formatCurrency(previous.saldo)}
            </p>
          </div>
        </div>
        {current.receitas === 0 && current.despesas === 0 && (
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            Nenhum movimento neste mês.
            <Link href="/lancamentos?novo=1" className="font-medium text-primary hover:underline">
              Lançar agora
            </Link>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function dashboardReportFilters(month: string): ReportFilters {
  const range = monthRange(month);
  return {
    aba: "categoria",
    periodo: "mes",
    tipo: "despesa",
    mes: month,
    de: null,
    ate: null,
    contas: [],
    cartoes: [],
    categorias: [],
    tags: [],
    onlyPaid: false,
    range: { from: range.start, to: range.end },
  };
}

async function CategoryBlock({
  month,
  workspaceId,
}: {
  month: string;
  workspaceId: string;
}) {
  const data = await getDashboardMonth(workspaceId, month);
  const base = dashboardReportFilters(month);
  const categories = data.categories.map((category) => ({
    ...category,
    href:
      category.others || category.id === "sem-categoria"
        ? undefined
        : reportTransactionsHref(base, { categoriaId: category.id }),
  }));

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm">Gastos por categoria</CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-9">
          <Link href={`/relatorios?periodo=mes&mes=${month}&tipo=despesa&aba=categoria`}>
            Relatório
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        <CategoryDonut categories={categories} total={data.categoryReport.total} />
      </CardContent>
    </Card>
  );
}

async function EvolutionBlock({
  month,
  workspaceId,
}: {
  month: string;
  workspaceId: string;
}) {
  const data = await getDashboardMonth(workspaceId, month);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Evolução mensal</CardTitle>
      </CardHeader>
      <CardContent>
        <EvolutionChart series6={data.series6} series12={data.series12} />
      </CardContent>
    </Card>
  );
}

async function UpcomingServerBlock({ workspaceId }: { workspaceId: string }) {
  const data = await getDashboardUpcoming(workspaceId);
  const today = todayISO();
  const invoices = data.invoices.map((invoice) => ({
    id: invoice.id,
    cartaoId: invoice.cartaoId,
    cartaoNome: invoice.cartaoNome,
    cartaoCor: invoice.cartaoCor,
    faturaChave: invoice.faturaChave,
    vencimento: invoice.vencimento,
    restante: invoice.restante,
    dueInDays: Math.round(
      (new Date(`${invoice.vencimento}T12:00:00Z`).getTime() -
        new Date(`${today}T12:00:00Z`).getTime()) /
        86_400_000,
    ),
  }));

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Próximos vencimentos</CardTitle>
      </CardHeader>
      <CardContent>
        <UpcomingBlock expenses={data.expenses} invoices={invoices} />
      </CardContent>
    </Card>
  );
}

async function CardsBlock({ workspaceId }: { workspaceId: string }) {
  const cards = await getDashboardCards(workspaceId);

  return (
    <Card className="h-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <CreditCard className="h-4 w-4 text-primary" aria-hidden="true" />
          Cartões
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {cards.length === 0 ? (
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>Nenhum cartão cadastrado.</p>
            <Button asChild variant="outline" size="sm" className="h-11 w-full sm:h-9">
              <Link href="/cartoes">Cadastrar cartão</Link>
            </Button>
          </div>
        ) : (
          cards.slice(0, 3).map((card) => {
            const ratio =
              card.limite > 0 ? card.limiteUsado / card.limite : 0;
            const toneText =
              ratio >= 1
                ? "text-destructive"
                : ratio >= 0.8
                  ? "text-warning"
                  : "text-muted-foreground";
            return (
              <Link
                key={card.id}
                href={`/cartoes/${card.id}?fatura=${card.currentInvoice.chave}`}
                className="block space-y-1.5 rounded-lg border border-border p-2.5 transition-colors hover:bg-accent/40"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs font-medium">{card.nome}</span>
                  <Badge variant={card.currentInvoice.status === "paga" ? "success" : "secondary"}>
                    {card.currentInvoice.status}
                  </Badge>
                </div>
                <p className="tabular text-sm font-semibold">
                  {formatCurrency(card.currentInvoice.restante)}
                </p>
                <p className="text-xs text-muted-foreground">
                  vence {formatDate(card.currentInvoice.vencimento)}
                </p>
                <BudgetProgress
                  gasto={card.limiteUsado}
                  limite={card.limite}
                  size="sm"
                  label={`Limite usado do cartão ${card.nome}`}
                />
                <p className={`text-xs ${toneText}`}>
                  {ratio >= 0.8
                    ? `Limite em ${Math.round(ratio * 100)}%`
                    : `${formatCurrency(card.disponivel)} disponível`}
                </p>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

async function ForecastBlock({
  userId,
  workspaceId,
}: {
  userId: string;
  workspaceId: string;
}) {
  const data = getForecastData(workspaceId, userId);
  return <ForecastMiniCard data={data} />;
}

async function BudgetsBlock({
  month,
  workspaceId,
}: {
  month: string;
  workspaceId: string;
}) {
  const budgets = listBudgetCycleDetails(workspaceId, month).map(
    (detail) => detail.resumo,
  );

  return (
    <BudgetCycleOverview
      ciclo={month}
      budgets={budgets}
      className="h-full"
    />
  );
}
