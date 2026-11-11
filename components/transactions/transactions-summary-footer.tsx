"use client";

import { useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { MonthSummary } from "@/lib/finance/summary";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionsSummaryFooterProps = {
  summary: MonthSummary;
};

function Value({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone?: string;
  hint?: string;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className={cn("tabular truncate text-sm font-semibold", tone)}>
        {formatCurrency(value)}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function TransactionsSummaryFooter({
  summary,
}: TransactionsSummaryFooterProps) {
  const [expanded, setExpanded] = useState(false);
  const aPagar = Math.max(0, summary.saidasPrevistas - summary.saidasPagas);
  const aReceber = Math.max(0, summary.entradasPrevistas - summary.entradasPagas);

  return (
    <>
      {/* Desktop */}
      <div className="fixed bottom-0 left-64 right-0 z-30 hidden border-t border-border bg-card/95 backdrop-blur lg:block">
        <div className="mx-auto max-w-7xl px-8 py-3">
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-8">
              <Value
                label="Saldo realizado"
                value={summary.saldoRealizado}
                tone={
                  summary.saldoRealizado >= 0
                    ? "text-success"
                    : "text-destructive"
                }
                hint="entradas − saídas pagas"
              />
              <Value
                label="Saldo previsto"
                value={summary.saldoPrevisto}
                tone={
                  summary.saldoPrevisto >= 0
                    ? "text-foreground"
                    : "text-destructive"
                }
                hint="inclui não pagos"
              />
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpanded((current) => !current)}
              aria-expanded={expanded}
            >
              <Plus
                className={cn(
                  "h-4 w-4 transition-transform",
                  expanded && "rotate-45",
                )}
              />
              Detalhes
            </Button>
          </div>

          {expanded && (
            <div className="mt-3 grid grid-cols-4 gap-4 border-t border-border pt-3">
              <Value
                label="Entradas"
                value={summary.entradasPrevistas}
                tone="text-success"
                hint="previstas"
              />
              <Value
                label="Saídas"
                value={summary.saidasPrevistas}
                tone="text-destructive"
                hint="previstas"
              />
              <Value
                label="Pago"
                value={summary.saldoRealizado}
                tone={
                  summary.saldoRealizado >= 0
                    ? "text-success"
                    : "text-destructive"
                }
                hint="realizado"
              />
              <Value
                label="A pagar"
                value={aPagar}
                tone="text-warning"
                hint={`a receber ${formatCurrency(aReceber)}`}
              />
            </div>
          )}
        </div>
      </div>

      {/* Mobile */}
      <div className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-border bg-card/95 backdrop-blur lg:hidden">
        <div className="px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <div className="grid min-w-0 flex-1 grid-cols-3 gap-2">
              <Value
                label="Entradas"
                value={summary.entradasPagas}
                tone="text-success"
              />
              <Value
                label="Saídas"
                value={summary.saidasPagas}
                tone="text-destructive"
              />
              <Value
                label="Saldo"
                value={summary.saldoPrevisto}
                tone={
                  summary.saldoPrevisto >= 0
                    ? "text-success"
                    : "text-destructive"
                }
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-11 w-11 shrink-0"
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

          {expanded && (
            <div className="mt-2 grid grid-cols-4 gap-2 border-t border-border pt-2">
              <Value label="Previsto" value={summary.saldoPrevisto} />
              <Value label="Pago" value={summary.saldoRealizado} />
              <Value label="A pagar" value={aPagar} tone="text-warning" />
              <Value label="A receber" value={aReceber} tone="text-success" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
