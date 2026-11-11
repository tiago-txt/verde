"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatCurrencyCompact, formatMonthShort } from "@/lib/format";
import type { MonthlyPoint, TopCategory } from "@/lib/finance/reports";

const PALETTE = [
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#fb7185",
  "#38bdf8",
  "#94a3b8",
];

export function CategoryDonut({
  categories,
  total,
}: {
  categories: (TopCategory & { href?: string })[];
  total: number;
}) {
  const router = useRouter();
  if (total <= 0 || categories.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Lance sua primeira despesa para ver o gráfico.
      </div>
    );
  }

  const data = categories.map((item, index) => ({
    ...item,
    color: item.cor ?? PALETTE[index % PALETTE.length],
  }));

  return (
    <div className="space-y-3">
      <div
        className="h-56 w-full"
        role="img"
        aria-label={`Despesas por categoria: ${data
          .map((item) => `${item.nome}, ${formatCurrency(item.total)}`)
          .join("; ")}`}
        onClickCapture={(event) => {
          const target = event.target as Element;
          const sector = target.closest("[data-recharts-item-index]");
          const href = sector?.getAttribute("href");
          if (href) {
            event.preventDefault();
            router.push(href);
          }
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="total"
              nameKey="nome"
              innerRadius="55%"
              outerRadius="82%"
              paddingAngle={1}
              stroke="transparent"
              style={{ cursor: "pointer" }}
            >
              {data.map((item) => (
                <Cell
                  key={item.id}
                  fill={item.color}
                  style={{ cursor: item.href ? "pointer" : "default" }}
                />
              ))}
            </Pie>
            <Tooltip
              formatter={(value) => formatCurrency(Number(value))}
              contentStyle={{
                background: "#111814",
                border: "1px solid #26332b",
                borderRadius: 8,
                color: "#e7efe9",
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      <ul className="space-y-1.5">
        {data.map((item) => (
          <li key={item.id}>
            {item.href ? (
              <a
                href={item.href}
                className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-accent"
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{item.nome}</span>
                <span className="tabular shrink-0 text-muted-foreground">
                  {formatCurrency(item.total)}
                </span>
                <span className="tabular w-10 shrink-0 text-right text-muted-foreground">
                  {Math.round(item.percent)}%
                </span>
              </a>
            ) : (
              <span className="flex items-center gap-2 px-1.5 py-1 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{item.nome}</span>
                <span className="tabular shrink-0 text-muted-foreground">
                  {formatCurrency(item.total)}
                </span>
                <span className="tabular w-10 shrink-0 text-right text-muted-foreground">
                  {Math.round(item.percent)}%
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>

      <p className="sr-only">
        Total de despesas: {formatCurrency(total)}.
      </p>
    </div>
  );
}

export function EvolutionChart({
  series6,
  series12,
}: {
  series6: MonthlyPoint[];
  series12: MonthlyPoint[];
}) {
  const [months, setMonths] = useState<6 | 12>(6);
  const data = months === 6 ? series6 : series12;
  const hasData = data.some(
    (point) => point.receitas > 0 || point.despesas > 0,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Últimos meses</p>
        <div className="flex gap-1">
          <Button
            type="button"
            variant={months === 6 ? "default" : "ghost"}
            size="sm"
            className="h-11 sm:h-9"
            onClick={() => setMonths(6)}
            aria-pressed={months === 6}
          >
            6 meses
          </Button>
          <Button
            type="button"
            variant={months === 12 ? "default" : "ghost"}
            size="sm"
            className="h-11 sm:h-9"
            onClick={() => setMonths(12)}
            aria-pressed={months === 12}
          >
            12 meses
          </Button>
        </div>
      </div>

      {!hasData ? (
        <div className="flex h-56 items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
          Ainda não há movimentos suficientes para a evolução.
        </div>
      ) : (
        <div
          className="h-64 w-full"
          role="img"
          aria-label={`Evolução mensal: ${data
            .map(
              (point) =>
                `${formatMonthShort(point.mes)}: receitas ${formatCurrency(
                  point.receitas,
                )}, despesas ${formatCurrency(point.despesas)}, saldo ${formatCurrency(
                  point.saldo,
                )}`,
            )
            .join("; ")}`}
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ left: 0, right: 4, top: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="mes"
                tickFormatter={(value) => formatMonthShort(String(value))}
                tick={{ fill: "#94a3b8", fontSize: 11 }}
                axisLine={{ stroke: "hsl(var(--border))" }}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(value) =>
                  formatCurrencyCompact(Number(value)).replace("R$", "")
                }
                tick={{ fill: "#94a3b8", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={42}
              />
              <Tooltip
                formatter={(value) => formatCurrency(Number(value))}
                labelFormatter={(value) => formatMonthShort(String(value))}
                contentStyle={{
                  background: "#111814",
                  border: "1px solid #26332b",
                  borderRadius: 8,
                  color: "#e7efe9",
                }}
              />
              <Legend
                wrapperStyle={{ color: "#94a3b8", fontSize: 11 }}
                formatter={(value) =>
                  value === "receitas"
                    ? "Receitas"
                    : value === "despesas"
                      ? "Despesas"
                      : "Saldo"
                }
              />
              <Bar dataKey="receitas" fill="#34d399" radius={[3, 3, 0, 0]} />
              <Bar dataKey="despesas" fill="#e0765b" radius={[3, 3, 0, 0]} />
              <Line
                type="monotone"
                dataKey="saldo"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
