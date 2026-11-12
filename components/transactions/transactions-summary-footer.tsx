"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronDown, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { MonthSummaryWithBudgets } from "@/lib/finance/budgets";
import {
  buildFooterBreakdown,
  buildFooterSummary,
} from "@/lib/finance/summary-display";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionsSummaryFooterProps = {
  summary: MonthSummaryWithBudgets & {
    faturasCartao?: number;
    pagamentosFatura?: number;
  };
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
  onOpen,
}: {
  label: string;
  value: number;
  tone?: string;
  onOpen?: () => void;
}) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-xs text-muted-foreground">
        {onOpen ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-6 items-center gap-1 rounded-md text-left underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
            <Info className="h-3 w-3" aria-hidden="true" />
          </button>
        ) : (
          label
        )}
      </dt>
      <dd className={cn("tabular text-sm font-semibold", tone)}>
        {plainNumber.format(value / 100)}
      </dd>
    </div>
  );
}

function Statement({
  values,
  onOpen,
}: {
  values: ReturnType<typeof buildFooterSummary>;
  onOpen: (kind: "despesa" | "receita") => void;
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
      <StatementRow
        label="receita prevista"
        value={values.entradasPrevistas}
        onOpen={() => onOpen("receita")}
      />
      <StatementRow
        label="despesa realizada"
        value={-values.saidas}
        tone="text-destructive"
      />
      <StatementRow
        label="despesa prevista"
        value={-values.saidasPrevistas}
        onOpen={() => onOpen("despesa")}
      />
      <div className="border-t border-border/70" />
      <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1 pt-0.5">
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">saldo</span>
          <span
            className={cn(
              "tabular text-sm font-semibold",
              closingTone(values.saldo),
            )}
          >
            {plainNumber.format(values.saldo / 100)}
          </span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">previsto</span>
          <span
            className={cn(
              "tabular text-sm font-semibold",
              closingTone(values.previsto),
            )}
          >
            {plainNumber.format(values.previsto / 100)}
          </span>
        </span>
      </div>
    </dl>
  );
}

export function TransactionsSummaryFooter({
  summary,
  openingBalance = 0,
}: TransactionsSummaryFooterProps) {
  const [expanded, setExpanded] = useState(false);
  const [breakdownKind, setBreakdownKind] = useState<
    "despesa" | "receita" | null
  >(null);
  const mobileRef = useRef<HTMLDivElement>(null);
  const values = buildFooterSummary(summary, openingBalance);
  const breakdown = buildFooterBreakdown(summary);
  const items = breakdownKind ? breakdown[breakdownKind] : [];
  const breakdownTotal = items.reduce((sum, item) => sum + item.value, 0);
  const shownTotal =
    breakdownKind === "despesa"
      ? values.saidasPrevistas
      : values.entradasPrevistas;

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
            <div className="ml-auto w-full max-w-sm border-b border-border pb-3">
              <Statement values={values} onOpen={setBreakdownKind} />
            </div>
          </div>
        )}
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-8 py-2.5">
          {!expanded && <div className="flex items-center gap-10">{totals}</div>}
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
          <div
            className={cn(
              "flex items-center gap-2",
              expanded ? "justify-end" : "justify-between",
            )}
          >
            {!expanded && (
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
            )}
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
              <Statement values={values} onOpen={setBreakdownKind} />
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={breakdownKind !== null}
        onOpenChange={(open) => {
          if (!open) setBreakdownKind(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>De onde vem este número</DialogTitle>
            <DialogDescription>
              {breakdownKind === "despesa"
                ? "Composição da despesa prevista do mês."
                : "Composição da receita prevista do mês."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1">
            {items.map((item) => (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => setBreakdownKind(null)}
                className="flex min-h-12 items-center justify-between gap-4 rounded-lg px-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="text-muted-foreground">{item.label}</span>
                <span
                  className={cn(
                    "tabular font-semibold",
                    item.value < 0 && "text-success",
                  )}
                >
                  {formatCurrency(item.value)}
                </span>
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
            <span className="text-sm font-medium">Total</span>
            <span className="tabular text-base font-bold">
              {formatCurrency(breakdownTotal)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            A soma dos componentes é {formatCurrency(breakdownTotal)} e o valor
            exibido no rodapé é {formatCurrency(shownTotal)}.
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
}
