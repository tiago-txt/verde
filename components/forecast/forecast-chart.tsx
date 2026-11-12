"use client";

import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency, formatCurrencyCompact, formatDate, formatMonthShort } from "@/lib/format";
import type { ForecastEvent, ForecastProjection } from "@/lib/finance/forecast";

type ForecastChartProps = {
  projection: ForecastProjection;
  projectionCerto: ForecastProjection;
  incluirEstimativas: boolean;
  focus?: { inicio: string; fim: string } | null;
  accountId?: string | null;
};

type ChartPoint = {
  data: string;
  saldo: number;
  certo: number;
};

function saldoNaData(
  projection: ForecastProjection,
  date: string,
  accountId?: string | null,
): number {
  let saldo = accountId
    ? (projection.pontos[0]?.porConta[accountId] ?? 0)
    : projection.saldoInicial;
  for (const point of projection.pontos) {
    if (point.data > date) break;
    saldo = accountId ? (point.porConta[accountId] ?? 0) : point.saldo;
  }
  return saldo;
}

function chartData(
  projection: ForecastProjection,
  projectionCerto: ForecastProjection,
  accountId?: string | null,
): ChartPoint[] {
  const dates = new Set<string>();
  for (const point of projection.pontos) dates.add(point.data);
  for (const point of projectionCerto.pontos) dates.add(point.data);
  return [...dates]
    .sort()
    .map((date) => ({
      data: date,
      saldo: saldoNaData(projection, date, accountId),
      certo: saldoNaData(projectionCerto, date, accountId),
    }));
}

function TooltipContent({
  active,
  label,
  payload,
  eventos,
}: {
  active?: boolean;
  label?: string | number;
  payload?: { value?: number }[];
  eventos: ForecastEvent[];
}) {
  if (!active || !payload?.length) return null;
  const date = String(label ?? "");
  const saldo = Number(payload[0]?.value ?? 0);
  const dayEvents = eventos.filter((event) => event.data === date).slice(0, 5);

  return (
    <div className="max-w-64 rounded-lg border border-border bg-card p-2.5 text-xs shadow-lg">
      <p className="font-medium">{formatDate(date)}</p>
      <p className="tabular mt-1 text-sm font-semibold">{formatCurrency(saldo)}</p>
      {dayEvents.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-muted-foreground">
          {dayEvents.map((event) => (
            <li key={event.id} className="truncate">
              {event.descricao}: {formatCurrency(event.valor)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ForecastChart({
  projection,
  projectionCerto,
  incluirEstimativas,
  focus,
  accountId,
}: ForecastChartProps) {
  const data = chartData(projection, projectionCerto, accountId);
  const saldos = data.map((point) => point.saldo);
  const min = Math.min(...saldos, projection.margem);
  const max = Math.max(...saldos, projection.margem);
  const markers = projection.eventos
    .filter(
      (event) =>
        (incluirEstimativas || event.certeza === "certo") &&
        event.valor >= 100_000,
    )
    .slice(0, 40)
    .map((event) => ({
      data: event.data,
      saldo: saldoNaData(projection, event.data, accountId),
      descricao: event.descricao,
    }));

  const summary = data
    .filter((_, index) => index % Math.max(1, Math.ceil(data.length / 8)) === 0)
    .map((point) => `${formatDate(point.data)}: ${formatCurrency(point.saldo)}`)
    .join("; ");

  return (
    <div
      className="h-72 w-full sm:h-80"
      role="img"
      aria-label={`Previsão de saldo. ${summary}`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="data"
            tickFormatter={(value) => formatMonthShort(String(value).slice(0, 7))}
            tick={{ fill: "hsl(var(--outline))", fontSize: 12 }}
            axisLine={{ stroke: "hsl(var(--border))" }}
            tickLine={false}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(value) =>
              formatCurrencyCompact(Number(value)).replace("R$", "")
            }
            tick={{ fill: "hsl(var(--outline))", fontSize: 12 }}
            axisLine={false}
            tickLine={false}
            width={46}
            domain={[min, max]}
          />
          <ReferenceArea
            y1={min}
            y2={projection.margem}
            fill="hsl(var(--destructive))"
            fillOpacity={0.1}
          />
          {focus && (
            <ReferenceArea
              x1={focus.inicio}
              x2={focus.fim}
              fill="hsl(var(--warning))"
              fillOpacity={0.12}
            />
          )}
          <ReferenceLine
            y={projection.margem}
            stroke="hsl(var(--destructive))"
            strokeDasharray="4 4"
          />
          <Tooltip
            content={(props) => (
              <TooltipContent
                active={props.active}
                label={props.label}
                payload={props.payload as unknown as { value?: number }[]}
                eventos={projection.eventos}
              />
            )}
          />
          <Line
            type="monotone"
            dataKey="certo"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
            name="Só o certo"
          />
          {incluirEstimativas && (
            <Line
              type="monotone"
              dataKey="saldo"
              stroke="hsl(var(--warning))"
              strokeWidth={2}
              strokeDasharray="6 4"
              dot={false}
              name="Com estimativas"
            />
          )}
          {!incluirEstimativas && (
            <Line
              type="monotone"
              dataKey="saldo"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
              name="Saldo"
            />
          )}
          {markers.map((marker) => (
            <ReferenceDot
              key={`${marker.data}:${marker.descricao}`}
              x={marker.data}
              y={marker.saldo}
              r={3}
              fill="hsl(var(--primary))"
              stroke="none"
            />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
