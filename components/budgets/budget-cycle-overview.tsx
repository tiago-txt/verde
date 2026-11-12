"use client";

import Link from "next/link";
import { ArrowRight, Target } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { BudgetCycleSummary } from "@/lib/db/queries/budgets";
import { formatCurrency, formatMonthTitle } from "@/lib/format";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { BudgetProgress } from "./budget-progress";

type BudgetCycleOverviewProps = {
  ciclo: string;
  budgets: BudgetCycleSummary[];
  title?: string;
  className?: string;
};

/**
 * Componente reutilizável para o dashboard (Etapa 5): barras compactas dos
 * orçamentos do ciclo, com atalho para a gestão.
 */
export function BudgetCycleOverview({
  ciclo,
  budgets,
  title = "Orçamentos do ciclo",
  className,
}: BudgetCycleOverviewProps) {
  return (
    <Card className={cn("space-y-3 p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{title}</p>
          <p className="text-xs text-muted-foreground">
            {formatMonthTitle(ciclo)}
          </p>
        </div>
        <Link
          href={`/limite-de-gastos?ciclo=${ciclo}`}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Ver
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {budgets.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
          <Target className="h-4 w-4" aria-hidden="true" />
          Nenhum orçamento neste ciclo.
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map((budget) => {
            const Icon = getIcon(budget.icone);
            return (
              <div key={budget.id} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Icon
                    className="h-3.5 w-3.5 shrink-0"
                    style={{ color: budget.cor }}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {budget.nome}
                  </span>
                  <span
                    className={cn(
                      "tabular shrink-0 text-xs",
                      budget.estouro > 0
                        ? "text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    {formatCurrency(budget.gasto)} /{" "}
                    {formatCurrency(budget.limite)}
                  </span>
                </div>
                <BudgetProgress
                  gasto={budget.gasto}
                  limite={budget.limite}
                  size="sm"
                  label={`Consumo do orçamento ${budget.nome}`}
                />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
