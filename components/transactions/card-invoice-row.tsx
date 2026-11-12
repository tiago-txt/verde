"use client";

import { AlertTriangle, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EntityTile } from "@/components/entity-tile";
import { PaymentProgress } from "@/components/cards/payment-progress";
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
  onPay: (event: CardInvoiceEvent) => void;
};

export function CardInvoiceRow({
  event,
  onOpen,
  onPay,
}: CardInvoiceRowProps) {
  const isOverdue = event.vencida;
  const isPartial = event.status === "parcial";
  const isPaid = event.status === "paga";

  return (
    <div
      className={cn(
        "flex w-full items-stretch border-l-2 border-dashed",
        isPaid
          ? "border-l-success/60 bg-success/[0.05]"
          : "border-l-info/60 bg-info/[0.05]",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(event)}
        aria-label={`Fatura ${event.cartaoNome}, total ${formatCurrency(event.total)}, restam ${formatCurrency(event.restante)}, vence ${formatDate(event.vencimento)}`}
        className="flex min-w-0 flex-1 items-start gap-3 px-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4"
      >
        <EntityTile
          kind="fatura"
          entity={{
            id: event.cartaoId,
            nome: event.cartaoNome,
            cor: event.cartaoCor,
            icone: event.cartaoIcone,
          }}
          size="sm"
          dashed={!isPaid}
          className="mt-0.5"
        />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-medium">
              Fatura {event.cartaoNome}
            </span>
            <Badge
              variant={
                isPaid
                  ? "success"
                  : isOverdue
                    ? "destructive"
                    : isPartial
                      ? "warning"
                      : "outline"
              }
            >
              {isOverdue && !isPaid
                ? "vencida"
                : STATUS_LABELS[event.status]}
            </Badge>
            {isPaid && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <Check className="h-3 w-3" aria-hidden="true" />
                quitada
              </span>
            )}
          </span>

          <span className="mt-1 block text-xs text-muted-foreground">
            pago {formatCurrency(event.pago)} · restam{" "}
            {formatCurrency(event.restante)}
          </span>

          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>vence {formatDate(event.vencimento)}</span>
            <span aria-hidden="true">·</span>
            <span>
              ciclo {formatDate(event.inicio).slice(0, 5)}–
              {formatDate(addDaysISO(event.fechamento, -1)).slice(0, 5)}
            </span>
            {isOverdue && !isPaid && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5 text-destructive">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  vencida
                </span>
              </>
            )}
          </span>

          <span className="mt-1.5 block">
            <PaymentProgress
              pago={event.pago}
              total={event.total}
              className="max-w-[220px]"
            />
          </span>
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end justify-center gap-1.5 py-3 pr-3 sm:pr-4">
        <span
          className={cn(
            "tabular text-sm font-semibold",
            isPaid
              ? "text-success"
              : isOverdue
                ? "text-destructive"
                : "text-foreground",
          )}
        >
          −{formatCurrency(event.total)}
        </span>
        {event.restante > 0 && (
          <Button
            type="button"
            size="sm"
            className="h-11"
            onClick={() => onPay(event)}
          >
            Pagar
          </Button>
        )}
      </div>
    </div>
  );
}
