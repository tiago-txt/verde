"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyCategorySeries } from "@/lib/finance/reports";
import type { ReportCategory } from "@/lib/finance/reports";
import {
  formatCurrency,
  formatCurrencyCompact,
  formatMonthShort,
  formatMonthTitle,
} from "@/lib/format";

const FALLBACK = ["#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#a78bfa"];
const OTHERS_COLOR = "#64748b";

export function CategoryBars({ items }: { items: ReportCategory[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum lançamento no período.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.slice(0, 10).map((item, index) => (
        <div key={item.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate">{item.nome}</span>
            <span className="tabular shrink-0 text-muted-foreground">
              {formatCurrency(item.total)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.max(0, item.percent))}%`,
                backgroundColor: item.cor ?? FALLBACK[index % FALLBACK.length],
              }}
            />
          </div>
        </div>
      ))}
      <p className="sr-only">
        {items
          .map(
            (item) =>
              `${item.nome}: ${formatCurrency(item.total)} (${Math.round(item.percent)}%)`,
          )
          .join("; ")}
      </p>
    </div>
  );
}

export function MonthlyCategoryChart({
  series,
}: {
  series: MonthlyCategorySeries;
}) {
  const hasData = series.points.some((point) =>
    series.categories.some((category) => Number(point[category.id] ?? 0) > 0) ||
    Number(point.outras ?? 0) > 0,
  );

  if (!hasData) {
    return (
      <p className="flex h-56 items-center justify-center text-sm text-muted-foreground">
        Nenhum lançamento no período.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div
        className="h-64 w-full"
        role="img"
        aria-label={`Gastos por mês e categoria. ${series.points
          .map((point) => {
            const total = series.categories.reduce(
              (sum, category) => sum + Number(point[category.id] ?? 0),
              Number(point.outras ?? 0),
            );
            return `${formatMonthTitle(String(point.mes))}: ${formatCurrency(total)}`;
          })
          .join("; ")}`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={series.points} margin={{ left: 0, right: 4, top: 8 }}>
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
              labelFormatter={(value) => formatMonthTitle(String(value))}
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
                value === "outras"
                  ? "Outras"
                  : (series.categories.find((item) => item.id === value)?.nome ??
                    String(value))
              }
            />
            {series.categories.map((category, index) => (
              <Bar
                key={category.id}
                dataKey={category.id}
                stackId="categorias"
                fill={category.cor ?? FALLBACK[index % FALLBACK.length]}
                radius={index === series.categories.length - 1 ? [3, 3, 0, 0] : 0}
              />
            ))}
            <Bar
              dataKey="outras"
              stackId="categorias"
              fill={OTHERS_COLOR}
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
