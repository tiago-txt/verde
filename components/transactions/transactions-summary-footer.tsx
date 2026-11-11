"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MonthSummaryWithBudgets } from "@/lib/finance/budgets";
import { buildFooterSummary } from "@/lib/finance/summary-display";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionsSummaryFooterProps = {
  summary: MonthSummaryWithBudgets & { faturasCartao?: number };
  openingBalance?: number;
};

/** Fechamento: de zero para cima é verde, abaixo de zero é vermelho. */
function closingTone(value: number): string {
  return value >= 0 ? "text-success" : "text-destructive";
}

const plainNumber = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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

function StatementRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("tabular text-sm font-semibold", tone)}>
        {plainNumber.format(value / 100)}
      </dd>
    </div>
  );
}

function Statement({
  values,
}: {
  values: ReturnType<typeof buildFooterSummary>;
}) {
  return (
    <dl className="space-y-1">
      <StatementRow label="saldo anterior" value={values.saldoAnterior} />
      <div className="border-t border-border/70" />
      <StatementRow
        label="receita realizada"
        value={values.entradas}
        tone="text-success"
      />
      <StatementRow label="receita prevista" value={values.entradasPrevistas} />
      <StatementRow
        label="despesa realizada"
        value={-values.saidas}
        tone="text-destructive"
      />
      <StatementRow label="despesa prevista" value={-values.saidasPrevistas} />
      <div className="border-t border-border/70" />
      <StatementRow
        label="saldo"
        value={values.saldo}
        tone={closingTone(values.saldo)}
      />
      <StatementRow
        label="previsto"
        value={values.previsto}
        tone={closingTone(values.previsto)}
      />
    </dl>
  );
}

export function TransactionsSummaryFooter({
  summary,
  openingBalance = 0,
}: TransactionsSummaryFooterProps) {
  const [expanded, setExpanded] = useState(false);
  const mobileRef = useRef<HTMLDivElement>(null);
  const values = buildFooterSummary(summary, openingBalance);

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

  const totals = (
    <>
      <Value
        label="Saldo"
        value={values.saldo}
        tone={closingTone(values.saldo)}
        strong
        align="right"
      />
      <Value
        label="Previsto"
        value={values.previsto}
        tone={closingTone(values.previsto)}
        strong
        align="right"
      />
    </>
  );

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-30 hidden border-t border-border bg-card/95 backdrop-blur lg:left-[var(--sidebar-width,260px)] lg:block">
        {expanded && (
          <div className="mx-auto max-w-7xl px-8 pt-3">
            <div className="relative ml-auto w-full max-w-sm border-b border-border pb-3 pr-9">
              <Statement values={values} />
              <button
                type="button"
                onClick={() => setExpanded(false)}
                aria-label="Fechar resumo"
                className="absolute right-0 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Minus className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-8 py-2.5">
          <div className="flex items-center gap-10">{totals}</div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
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
          </Button>
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
                label="Saldo"
                value={values.saldo}
                tone={closingTone(values.saldo)}
                strong
              />
              <Value
                label="Previsto"
                value={values.previsto}
                tone={closingTone(values.previsto)}
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
            <div className="mt-2 border-t border-border pt-2">
              <Statement values={values} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
