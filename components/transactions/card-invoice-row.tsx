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
    <div className="group relative flex min-h-[72px] w-full items-stretch overflow-hidden rounded-lg border border-grout/80 bg-surface-low shadow-[0_4px_16px_rgba(7,16,11,0.45)] opacity-90">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-[3px] border-l-2 border-dashed transition-[width] duration-150 lg:group-hover:w-1",
          isPaid ? "border-l-success/70" : "border-l-info/70",
        )}
      />

      <button
        type="button"
        onClick={() => onOpen(event)}
        aria-label={`Fatura ${event.cartaoNome}, total ${formatCurrency(event.total)}, restam ${formatCurrency(event.restante)}, vence ${formatDate(event.vencimento)}`}
        className="flex min-w-0 flex-1 items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-forest-container/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-3 sm:px-4"
      >
        <EntityTile
          kind="fatura"
          entity={{
            id: event.cartaoId,
            nome: event.cartaoNome,
            cor: event.cartaoCor,
            icone: event.cartaoIcone,
          }}
          dashed={!isPaid}
          className="h-10 w-10 sm:h-12 sm:w-12"
        />

        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="row-title">
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
              className="px-1.5 py-0 text-xs"
            >
              {isOverdue && !isPaid
                ? "vencida"
                : STATUS_LABELS[event.status]}
            </Badge>
            {isPaid && (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                <Check className="h-3 w-3" aria-hidden="true" />
                quitada
              </span>
            )}
          </span>

          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span>
              pago <span className="tabular">{formatCurrency(event.pago)}</span>{" "}
              · restam{" "}
              <span className="tabular">{formatCurrency(event.restante)}</span>
            </span>
            <span aria-hidden="true">·</span>
            <span>vence {formatDate(event.vencimento)}</span>
            <span aria-hidden="true">·</span>
            <span>
              ciclo {formatDate(event.inicio).slice(0, 5)}–
              {formatDate(addDaysISO(event.fechamento, -1)).slice(0, 5)}
            </span>
            {isOverdue && !isPaid && (
              <>
                <span aria-hidden="true">·</span>
                <span className="inline-flex items-center gap-0.5 text-clay">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  vencida
                </span>
              </>
            )}
          </span>

          <span className="mt-1 block max-w-[220px]">
            <PaymentProgress pago={event.pago} total={event.total} />
          </span>
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end justify-center gap-1.5 py-3 pr-3 sm:pr-4">
        <span
          className={cn(
            "row-value",
            isPaid
              ? "text-primary"
              : isOverdue
                ? "text-clay"
                : "text-on-surface",
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
