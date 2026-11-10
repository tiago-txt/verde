import Link from "next/link";
import {
  ArrowRight,
  ArrowLeftRight,
  CreditCard,
  Plus,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { requireUser } from "@/lib/auth/current-user";
import { currentMonth } from "@/lib/dates";
import { formatCurrency, formatMonthTitle } from "@/lib/format";

const steps = [
  {
    title: "Cadastre sua primeira conta",
    description:
      "Conta corrente, poupança, dinheiro ou investimento — o saldo inicial vira o ponto de partida.",
    href: "/contas",
  },
  {
    title: "Confira as categorias padrão",
    description:
      "Moradia, Mercado, Transporte, Saúde, Lazer, Salário e outras já estão prontas em pt-BR.",
    href: "/configuracoes",
  },
  {
    title: "Registre um lançamento",
    description:
      "Despesas, receitas e transferências, com recorrência e parcelamento quando precisar.",
    href: "/lancamentos?novo=1",
  },
];

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.nome.split(/\s+/)[0] ?? user.nome;
  const monthLabel = formatMonthTitle(currentMonth());

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Olá, ${firstName}`}
        description="Este é o resumo das suas finanças. Tudo começa com uma conta e o primeiro lançamento."
        action={
          <Button asChild>
            <Link href="/lancamentos?novo=1">
              <Plus className="h-4 w-4" />
              Novo lançamento
            </Link>
          </Button>
        }
      />

      <section
        aria-label="Resumo do mês"
        className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        <StatCard
          title="Saldo total"
          value={formatCurrency(0)}
          hint="Soma das contas ativas"
          icon={Wallet}
          tone="info"
        />
        <StatCard
          title="Receitas do mês"
          value={formatCurrency(0)}
          hint={monthLabel}
          icon={TrendingUp}
          tone="positive"
        />
        <StatCard
          title="Despesas do mês"
          value={formatCurrency(0)}
          hint={monthLabel}
          icon={TrendingDown}
          tone="negative"
        />
        <StatCard
          title="Faturas abertas"
          value={formatCurrency(0)}
          hint="Nenhum cartão cadastrado"
          icon={CreditCard}
          tone="warning"
        />
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center gap-3 space-y-0">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <CardTitle>Primeiros passos</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure o Verde em poucos minutos.
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {steps.map((step, index) => (
              <Link
                key={step.title}
                href={step.href}
                className="group flex items-start gap-3 rounded-lg border border-border/70 bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-accent/60"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {step.title}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {step.description}
                  </span>
                </span>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Faturas abertas</CardTitle>
            <p className="text-sm text-muted-foreground">
              Cartões de crédito e seus vencimentos.
            </p>
          </CardHeader>
          <CardContent>
            <EmptyState
              icon={CreditCard}
              title="Nenhum cartão cadastrado"
              description="Cadastre um cartão para acompanhar faturas e limite disponível."
              action={
                <Button asChild variant="outline" size="sm">
                  <Link href="/cartoes">Cadastrar cartão</Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle>Últimos lançamentos</CardTitle>
            <p className="text-sm text-muted-foreground">
              Seus movimentos mais recentes aparecerão aqui.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/lancamentos">Ver todos</Link>
          </Button>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={ArrowLeftRight}
            title="Nenhum lançamento ainda"
            description="Adicione sua primeira despesa ou receita para começar a acompanhar o mês."
            action={
              <Button asChild size="sm">
                <Link href="/lancamentos?novo=1">
                  <Plus className="h-4 w-4" />
                  Adicionar lançamento
                </Link>
              </Button>
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
