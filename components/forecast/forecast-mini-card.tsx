import Link from "next/link";
import { ArrowRight, LineChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ForecastData } from "@/lib/db/queries/forecast";

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
  const situation =
    negativo && first
      ? `Negativo a partir de ${formatDate(first.inicio)}; mínimo ${formatCurrency(first.menorSaldo)}.`
      : `Positivo pelos próximos ${data.prefs.horizonte} meses; mínimo ${formatCurrency(data.menorSaldo.saldo)} em ${formatDate(data.menorSaldo.data)}.`;

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
      </CardContent>
    </Card>
  );
}
