"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MonthSummaryWithBudgets } from "@/lib/finance/budgets";
import { buildFooterSummary } from "@/lib/finance/summary-display";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionsSummaryFooterProps = {
  summary: MonthSummaryWithBudgets & { faturasCartao?: number };
};

/** Fechamento: de zero para cima é verde, abaixo de zero é vermelho. */
function closingTone(value: number): string {
  return value >= 0 ? "text-success" : "text-destructive";
}

function Value({
  label,
  value,
  tone,
  strong = false,
  align = "left",
}: {
  label: string;
  value: number;
  tone?: string;
  strong?: boolean;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
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

function ListRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular text-sm font-semibold", tone)}>
        {formatCurrency(value)}
      </dd>
    </div>
  );
}

export function TransactionsSummaryFooter({
  summary,
}: TransactionsSummaryFooterProps) {
  const [expanded, setExpanded] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);
  const values = buildFooterSummary(summary);

  // O FAB usa a altura real do resumo para ficar sempre logo acima dele.
  useEffect(() => {
    const node = mobileRef.current;
    if (!node) return;

    const update = () => {
      const height = Math.max(
        64,
        Math.round(node.getBoundingClientRect().height),
      );
      document.documentElement.style.setProperty(
        "--verde-summary-height",
        `${height}px`,
      );
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--verde-summary-height");
    };
  }, []);

  const detalhes = (
    <dl className="space-y-1.5">
      <ListRow
        label="Entradas"
        value={values.entradas}
        tone="text-success"
      />
      <ListRow
        label="Saídas"
        value={values.saidas}
        tone="text-destructive"
      />
      <ListRow
        label="Entradas previstas"
        value={values.entradasPrevistas}
        tone="text-success"
      />
      <ListRow
        label="Saídas previstas"
        value={values.saidasPrevistas}
        tone="text-destructive"
      />
    </dl>
  );

  const totals = (
    <>
      <Value
        label="Total"
        value={values.realizado}
        tone={closingTone(values.realizado)}
        strong
        align="right"
      />
      <Value
        label="Total previsto"
        value={values.totalPrevisto}
        tone={closingTone(values.totalPrevisto)}
        strong
        align="right"
      />
    </>
  );

  const mobileMetrics = (
    <>
      <Value label="Entradas" value={values.entradas} tone="text-success" />
      <Value label="Saídas" value={values.saidas} tone="text-destructive" />
      <Value
        label="Total"
        value={values.realizado}
        tone={closingTone(values.realizado)}
        strong
      />
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
        tone={closingTone(values.totalPrevisto)}
        strong
      />
    </>
  );

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 hidden border-t border-border bg-card/95 backdrop-blur lg:left-[var(--sidebar-width,260px)] lg:block">
        {expanded && (
          <div className="mx-auto max-w-7xl px-8 pt-3">
            <div className="ml-auto w-full max-w-sm border-b border-border pb-3">
              {detalhes}
            </div>
          </div>
        )}
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-8 py-2.5">
          <Button
            type="button"
            variant="ghost"
            className="h-10 gap-1.5 rounded-full px-3 text-xs"
            onClick={() => setExpanded((current) => !current)}
            aria-expanded={expanded}
            aria-label={expanded ? "Recolher resumo" : "Expandir resumo"}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                expanded && "rotate-180",
              )}
            />
            Resumo
          </Button>
          <div className="flex items-center gap-10">{totals}</div>
        </div>
      </div>

      <div
        ref={mobileRef}
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden"
      >
        <div className="px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-2 gap-3">
              <Value
                label="Total"
                value={values.realizado}
                tone={closingTone(values.realizado)}
                strong
              />
              <Value
                label="Total previsto"
                value={values.totalPrevisto}
                tone={closingTone(values.totalPrevisto)}
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
            <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2">
              {mobileMetrics}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
