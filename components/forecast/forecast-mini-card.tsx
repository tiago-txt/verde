import Link from "next/link";
import { ArrowRight, LineChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ForecastData } from "@/lib/db/queries/forecast";
import { impactoNoTotal } from "@/lib/finance/forecast";
import { NumberSource } from "@/components/dashboard/number-source";

function sparklinePoints(data: ForecastData): string {
  const points = data.projection.pontos.filter((_, index) => index % Math.max(1, Math.ceil(data.projection.pontos.length / 24)) === 0);
  if (points.length === 0) return "0,30 200,30";
  const values = points.map((point) => point.saldo);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return points
    .map((point, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 200;
      const y = 52 - ((point.saldo - min) / span) * 44;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function ForecastMiniCard({ data }: { data: ForecastData }) {
  const negativo = data.alertas.length > 0;
  const first = data.alertas[0];
  const escopoRestrito =
    data.prefs.contas.length <
    data.contasDisponiveis.filter((conta) => !conta.arquivada).length;
  const situation =
    negativo && first
      ? data.projection.saldoInicial < data.prefs.margem
        ? `Saldo atual já negativo (${formatCurrency(data.projection.saldoInicial)}); mínimo ${formatCurrency(first.menorSaldo)} em ${formatDate(first.menorData)}.`
        : `Negativo a partir de ${formatDate(first.inicio)}; mínimo ${formatCurrency(first.menorSaldo)}.`
      : `Positivo pelos próximos ${data.prefs.horizonte} meses; mínimo ${formatCurrency(data.menorSaldo.saldo)} em ${formatDate(data.menorSaldo.data)}.`;
  const ultimo = data.projection.pontos.at(-1)?.saldo ?? data.projection.saldoInicial;
  const contasSelecionadas = new Set(
    data.projection.entrada.contas.map((conta) => conta.id),
  );
  let entradas = 0;
  let saidas = 0;
  let liberacoes = 0;
  for (const evento of data.projection.eventos) {
    const impacto = impactoNoTotal(evento, contasSelecionadas);
    if (evento.kind === "liberacao") {
      liberacoes += Math.max(0, impacto);
      continue;
    }
    if (impacto > 0) entradas += impacto;
    else if (impacto < 0) saidas += Math.abs(impacto);
  }

  return (
    <Card className="h-full">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <LineChart className="h-4 w-4 text-primary" aria-hidden="true" />
          Previsão
        </CardTitle>
        <Button asChild variant="ghost" size="sm" className="h-12 sm:h-9">
          <Link href="/previsao">
            Abrir
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <svg
          viewBox="0 0 200 60"
          className={negativo ? "h-16 w-full text-destructive" : "h-16 w-full text-success"}
          role="img"
          aria-label={situation}
          preserveAspectRatio="none"
        >
          <polyline
            points={sparklinePoints(data)}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <p className="text-xs text-muted-foreground">{situation}</p>
        {escopoRestrito && (
          <p className="rounded-md border border-warning/40 bg-warning/5 px-2 py-1.5 text-xs text-muted-foreground">
            Escopo restrito: a previsão não inclui todas as contas. O saldo
            total do app pode ser diferente.
          </p>
        )}
        <NumberSource
          title="De onde vem a previsão?"
          description="Ponto de partida: saldo total em contas hoje (operacional + investimentos). Transferências entre contas próprias são neutras."
          total={ultimo}
          items={[
            {
              label: "Saldo total em contas hoje",
              value: data.projection.saldoInicial,
              href: "/contas",
            },
            {
              label: "Entradas previstas",
              value: entradas,
              href: "/lancamentos",
            },
            {
              label: "Saídas previstas",
              value: -saidas,
              href: "/lancamentos",
            },
            {
              label: "Liberações de orçamento",
              value: liberacoes,
              href: "/limite-de-gastos",
            },
          ]}
          formula={`Saldo no fim do horizonte de ${data.prefs.horizonte} meses.`}
          note="Sem média diária de gastos. Faturas de cartão e reservas de orçamento entram nas saídas."
          triggerClassName="w-full justify-start px-0"
        />
      </CardContent>
    </Card>
  );
}
