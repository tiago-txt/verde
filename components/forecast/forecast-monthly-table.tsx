"use client";

import Link from "next/link";
import { formatCurrency, formatMonthShort } from "@/lib/format";
import type { ForecastMonth } from "@/lib/finance/forecast";
import { cn } from "@/lib/utils";

export function ForecastMonthlyTable({ months }: { months: ForecastMonth[] }) {
  return (
    <div className="space-y-2">
      <div className="hidden overflow-x-auto rounded-xl border border-border sm:block">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Mês</th>
              <th className="px-3 py-2 text-right font-medium">Inicial</th>
              <th className="px-3 py-2 text-right font-medium">Entradas</th>
              <th className="px-3 py-2 text-right font-medium">Saídas</th>
              <th className="px-3 py-2 text-right font-medium">Final</th>
              <th className="px-3 py-2 text-right font-medium">Mínimo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {months.map((month) => (
              <tr
                key={month.mes}
                className={cn(
                  "transition-colors hover:bg-accent/40",
                  month.negativo && "bg-destructive/5",
                )}
              >
                <td className="px-3 py-2">
                  <Link
                    href={`/lancamentos?mes=${month.mes}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {formatMonthShort(month.mes)}
                  </Link>
                </td>
                <td className="tabular px-3 py-2 text-right">
                  {formatCurrency(month.saldoInicial)}
                </td>
                <td className="tabular px-3 py-2 text-right text-success">
                  {formatCurrency(month.entradas)}
                </td>
                <td className="tabular px-3 py-2 text-right text-destructive">
                  {formatCurrency(month.saidas)}
                </td>
                <td
                  className={cn(
                    "tabular px-3 py-2 text-right font-semibold",
                    month.saldoFinal < 0 && "text-destructive",
                  )}
                >
                  {formatCurrency(month.saldoFinal)}
                </td>
                <td
                  className={cn(
                    "tabular px-3 py-2 text-right",
                    month.negativo && "font-semibold text-destructive",
                  )}
                >
                  {formatCurrency(month.minimo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:hidden">
        {months.map((month) => (
          <Link
            key={month.mes}
            href={`/lancamentos?mes=${month.mes}`}
            className={cn(
              "rounded-xl border border-border bg-card p-3 text-sm",
              month.negativo && "border-destructive/40 bg-destructive/5",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium">{formatMonthShort(month.mes)}</span>
              <span
                className={cn(
                  "tabular font-semibold",
                  month.saldoFinal < 0 && "text-destructive",
                )}
              >
                {formatCurrency(month.saldoFinal)}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              mínimo {formatCurrency(month.minimo)} · entradas{" "}
              {formatCurrency(month.entradas)} · saídas{" "}
              {formatCurrency(month.saidas)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
