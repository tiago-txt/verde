"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MonthSummaryWithBudgets } from "@/lib/finance/budgets";
import { buildFooterSummary } from "@/lib/finance/summary-display";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionsSummaryFooterProps = {
  summary: MonthSummaryWithBudgets & { faturasCartao?: number };
};

function Value({
  label,
  value,
  tone,
  strong = false,
}: {
  label: string;
  value: number;
  tone?: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] text-muted-foreground sm:text-[11px]">
        {label}
      </p>
      <p
        className={cn(
          "tabular truncate font-semibold",
          strong ? "text-lg sm:text-base" : "text-sm",
          tone,
        )}
      >
        {formatCurrency(value)}
      </p>
    </div>
  );
}

export function TransactionsSummaryFooter({
  summary,
}: TransactionsSummaryFooterProps) {
  const [expanded, setExpanded] = useState(false);
  const values = buildFooterSummary(summary);

  useEffect(() => {
    document.documentElement.dataset.summary = expanded ? "open" : "closed";
    return () => {
      delete document.documentElement.dataset.summary;
    };
  }, [expanded]);

  const realizado = (
    <>
      <Value label="Entradas" value={values.entradas} tone="text-success" />
      <Value label="Saídas" value={values.saidas} tone="text-destructive" />
      <Value
        label="Total"
        value={values.realizado}
        tone={values.realizado >= 0 ? "text-foreground" : "text-destructive"}
        strong
      />
    </>
  );

  const previsto = (
    <>
      <Value
        label="Entradas previstas"
        value={values.entradasPrevistas}
        tone="text-success"
      />
      <Value
        label="Saídas previstas"
        value={values.saidasPrevistas}
        tone="text-destructive"
      />
      <Value
        label="Total previsto"
        value={values.totalPrevisto}
        tone={
          values.totalPrevisto >= 0 ? "text-foreground" : "text-destructive"
        }
        strong
      />
    </>
  );

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 hidden border-t border-border bg-card/95 backdrop-blur lg:left-[var(--sidebar-width,260px)] lg:block">
        <div className="mx-auto grid max-w-7xl grid-cols-6 gap-4 px-8 py-3">
          {realizado}
          {previsto}
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
              <Value
                label="Total"
                value={values.realizado}
                tone={
                  values.realizado >= 0
                    ? "text-foreground"
                    : "text-destructive"
                }
                strong
              />
              <Value
                label="Total previsto"
                value={values.totalPrevisto}
                tone={
                  values.totalPrevisto >= 0
                    ? "text-foreground"
                    : "text-destructive"
                }
                strong
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-12 w-12 shrink-0"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
              aria-label={expanded ? "Recolher resumo" : "Expandir resumo"}
            >
              <ChevronDown
                className={cn(
                  "h-5 w-5 transition-transform",
                  expanded && "rotate-180",
                )}
              />
            </Button>
          </div>

          {expanded && (
            <div className="mt-2 space-y-2 border-t border-border pt-2">
              <div className="grid grid-cols-3 gap-2">{realizado}</div>
              <div className="grid grid-cols-3 gap-2">{previsto}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
