"use client";

import { AlertTriangle, CreditCard } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { CardInvoiceEvent } from "@/lib/db/queries/cards";
import { addDaysISO } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<CardInvoiceEvent["status"], string> = {
  aberta: "aberta",
  fechada: "fechada",
  parcial: "parcial",
  paga: "paga",
};

type CardInvoiceRowProps = {
  event: CardInvoiceEvent;
  onOpen: (event: CardInvoiceEvent) => void;
};

export function CardInvoiceRow({ event, onOpen }: CardInvoiceRowProps) {
  const isOverdue = event.vencida;
  const isPartial = event.status === "parcial";

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      aria-label={`Fatura ${event.cartaoNome}, ${formatCurrency(event.restante)}, vence ${formatDate(event.vencimento)}`}
      className="flex w-full items-start gap-3 border-l-2 border-dashed border-l-indigo-400/60 bg-indigo-500/[0.05] px-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
    >
      <span
        className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{
          backgroundColor: `${event.cartaoCor}22`,
          color: event.cartaoCor,
        }}
      >
        <CreditCard className="h-4 w-4" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">Fatura {event.cartaoNome}</span>
          <Badge
            variant={
              isOverdue
                ? "destructive"
                : isPartial
                  ? "warning"
                  : "outline"
            }
          >
            {isOverdue ? "vencida" : STATUS_LABELS[event.status]}
          </Badge>
          {event.pago > 0 && event.restante > 0 && (
            <span className="text-[10px] text-muted-foreground">
              pago {formatCurrency(event.pago)} de {formatCurrency(event.total)}
            </span>
          )}
        </span>

        <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
          <span>vence {formatDate(event.vencimento)}</span>
          <span aria-hidden="true">·</span>
          <span>
            ciclo {formatDate(event.inicio).slice(0, 5)}–
            {formatDate(addDaysISO(event.fechamento, -1)).slice(0, 5)}
          </span>
          {isOverdue && (
            <>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-0.5 text-destructive">
                <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                vencida
              </span>
            </>
          )}
        </span>
      </span>

      <span
        className={cn(
          "tabular mt-0.5 shrink-0 text-sm font-semibold",
          isOverdue ? "text-destructive" : "text-foreground",
        )}
      >
        −{formatCurrency(event.restante)}
      </span>
    </button>
  );
}
