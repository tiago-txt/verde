"use client";

import { useState } from "react";
import {
  Area,
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
import { X } from "lucide-react";
import { formatCurrency, formatCurrencyCompact, formatDate, formatMonthShort } from "@/lib/format";
import {
  saldoNaData,
  serieDoGrafico,
  type ForecastChartPoint,
  type ForecastProjection,
} from "@/lib/finance/forecast";

type ForecastChartProps = {
  projection: ForecastProjection;
  projectionCerto: ForecastProjection;
  incluirEstimativas: boolean;
  focus?: { inicio: string; fim: string } | null;
  accountId?: string | null;
};

function TooltipContent({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: { payload?: ForecastChartPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const temFaixa = row.faixa > 0;

  return (
    <div className="max-w-56 rounded-lg border border-border bg-card p-2.5 text-xs shadow-lg max-sm:shadow-md">
      <p className="font-medium">{formatDate(String(label ?? row.data))}</p>
      <p className="tabular mt-1 text-sm font-semibold">
        {temFaixa
          ? `Pior caso: ${formatCurrency(row.pior)}`
          : formatCurrency(row.pior)}
      </p>
      {temFaixa && (
        <p className="tabular text-muted-foreground">
          Melhor caso: {formatCurrency(row.melhor)}
        </p>
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
  const [dia, setDia] = useState<string | null>(null);
  const data = serieDoGrafico(projection, projectionCerto, accountId);
  const saldos = data.flatMap((point) => [point.pior, point.melhor]);
  const min = Math.min(...saldos, projection.margem);
  const max = Math.max(...saldos, projection.margem);
  const temFaixa = data.some((point) => point.faixa > 0);
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
    .map((point) =>
      point.faixa > 0
        ? `${formatDate(point.data)}: ${formatCurrency(point.pior)} (melhor caso: ${formatCurrency(point.melhor)})`
        : `${formatDate(point.data)}: ${formatCurrency(point.pior)}`,
    )
    .join("; ");

  const diaSelecionado = dia
    ? data.find((point) => point.data === dia)
    : undefined;
  const eventosDoDia = dia
    ? projection.eventos.filter((event) => event.data === dia)
    : [];

  return (
    <>
      <div
        className="h-72 w-full sm:h-80"
        role="img"
        aria-label={`Previsão de saldo. ${summary}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ left: 0, right: 8, top: 8 }}
            onClick={(state) => {
              const label = state?.activeLabel;
              if (label === undefined) return;
              const valor = String(label);
              setDia((atual) => (atual === valor ? null : valor));
            }}
          >
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
                  payload={props.payload as unknown as { payload?: ForecastChartPoint }[]}
                />
              )}
            />
            <Area
              type="monotone"
              dataKey="pior"
              stackId="casos"
              stroke="hsl(var(--primary))"
              strokeWidth={2.5}
              fill="hsl(var(--primary))"
              fillOpacity={0.35}
              activeDot={{ r: 3 }}
              name="Pior caso"
            />
            {temFaixa && (
              <Area
                type="monotone"
                dataKey="faixa"
                stackId="casos"
                stroke="none"
                fill="hsl(var(--warning))"
                fillOpacity={0.12}
                activeDot={false}
                name="Reservado ou estimado"
              />
            )}
            {temFaixa && (
              <Line
                type="monotone"
                dataKey="melhor"
                stroke="hsl(var(--muted-foreground))"
                strokeOpacity={0.7}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
                activeDot={false}
                name="Melhor caso"
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
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-5 rounded-full bg-primary" />
          Pior caso: com reservas e estimativas
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="w-5 border-t border-dashed border-muted-foreground/70" />
          Melhor caso: só eventos certos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-5 rounded-sm bg-warning/30" />
          Reservado ou estimado
        </span>
      </div>
      {!dia && (
        <p className="mt-1 text-xs text-muted-foreground">
          Clique em um dia do gráfico para ver as movimentações.
        </p>
      )}
      {dia && diaSelecionado && (
        <div className="mt-2 rounded-lg border border-border bg-card p-2.5 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-medium">{formatDate(dia)}</p>
              <p className="tabular text-muted-foreground">
                Pior caso: {formatCurrency(diaSelecionado.pior)}
                {diaSelecionado.faixa > 0
                  ? ` · Melhor caso: ${formatCurrency(diaSelecionado.melhor)}`
                  : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setDia(null)}
              aria-label="Fechar detalhes do dia"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-9 sm:w-9"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
          <details className="mt-1">
            <summary className="cursor-pointer select-none py-2 text-muted-foreground">
              Movimentações do dia ({eventosDoDia.length})
            </summary>
            {eventosDoDia.length > 0 ? (
              <ul className="mt-1 space-y-1">
                {eventosDoDia.map((event) => (
                  <li
                    key={event.id}
                    className="flex items-baseline justify-between gap-3"
                  >
                    <span className="truncate">{event.descricao}</span>
                    <span className="tabular shrink-0">
                      {formatCurrency(event.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-muted-foreground">
                Nenhuma movimentação neste dia.
              </p>
            )}
          </details>
        </div>
      )}
    </>
  );
}
