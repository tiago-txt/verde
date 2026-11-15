"use client";

import { ArrowRight, ThumbsDown, ThumbsUp } from "lucide-react";
import { EntityTile } from "@/components/entity-tile";
import type { CardInvoiceEvent } from "@/lib/db/queries/cards";
import { formatCurrency, formatDate, formatMonthTitle } from "@/lib/format";
import { invoiceProjectionStatus } from "@/lib/design/row-status";
import { cn } from "@/lib/utils";

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
  const isPaid = event.status === "paga";
  const projectionStatus = invoiceProjectionStatus({
    vencida: event.vencida,
    status: event.status,
  });
  const statusMeta = {
    aberta: { label: "Aberta", tone: "text-amber" },
    fechada: { label: "Fechada", tone: "text-info" },
    parcial: { label: "Parcial", tone: "text-amber" },
    paga: { label: "Paga", tone: "text-primary" },
    vencida: { label: "Vencida", tone: "text-clay" },
  }[projectionStatus];
  const pagador =
    event.pagamentos.find((item) => Boolean(item.contaNome)) ?? null;
  const outrosPagadores = pagador
    ? event.pagamentos.filter((item) => item.contaId !== pagador.contaId).length
    : 0;

  const ariaLabel = [
    `Fatura ${event.cartaoNome}`,
    `total ${formatCurrency(event.total)}`,
    ...(event.restante > 0
      ? [`restam ${formatCurrency(event.restante)}`]
      : []),
    ...(isPaid
      ? pagador?.contaNome
        ? [`paga por ${pagador.contaNome}`]
        : []
      : [`vence ${formatDate(event.vencimento)}`]),
  ].join(", ");

  return (
    <div className="list-row-cv-virtual group relative flex min-h-[72px] w-full items-center gap-2.5 pl-2.5 pr-0 text-left transition-colors max-sm:py-1 sm:gap-3 lg:hover:bg-forest-container/60">
      <button
        type="button"
        onClick={() => onOpen(event)}
        aria-label={ariaLabel}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md px-0 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
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
          plain
          className="h-9 w-9 sm:h-10 sm:w-10"
        />

        <span className="min-w-0 flex-1">
          <span className="row-title block">
            {event.cartaoNome}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              {isPaid
                ? "Pagamento de Fatura"
                : `Fatura ${formatMonthTitle(event.inicio.slice(0, 7))}`}
            </span>
          </span>
          <span className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5 overflow-hidden text-xs text-muted-foreground sm:text-sm">
            {isPaid ? (
              pagador ? (
                <>
                  <EntityTile
                    kind="conta"
                    entity={{
                      id: pagador.contaId,
                      nome: pagador.contaNome,
                      cor: pagador.contaCor,
                      icone: pagador.contaIcone,
                    }}
                    size="xxs"
                    plain
                    className="shrink-0"
                  />
                  <span className="truncate">
                    {pagador.contaNome ?? "sem conta"}
                  </span>
                  {outrosPagadores > 0 && (
                    <span
                      className="shrink-0"
                      title={`Mais ${outrosPagadores} conta(s)`}
                    >
                      +{outrosPagadores}
                    </span>
                  )}
                  <ArrowRight
                    className="h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <EntityTile
                    kind="cartao"
                    entity={{
                      id: event.cartaoId,
                      nome: event.cartaoNome,
                      cor: event.cartaoCor,
                      icone: event.cartaoIcone,
                    }}
                    size="xxs"
                    plain
                    className="shrink-0"
                  />
                  <span className="truncate">{event.cartaoNome}</span>
                </>
              ) : (
                <span className="truncate">{statusMeta.label}</span>
              )
            ) : (
              <>
                <EntityTile
                  kind="cartao"
                  entity={{
                    id: event.cartaoId,
                    nome: event.cartaoNome,
                    cor: event.cartaoCor,
                    icone: event.cartaoIcone,
                  }}
                  size="xxs"
                  plain
                  className="shrink-0"
                />
                <span className="truncate">{event.cartaoNome}</span>
                {event.pago > 0 && event.restante > 0 && (
                  <>
                    <span aria-hidden="true" className="shrink-0">
                      ·
                    </span>
                    <span className="truncate">
                      restam{" "}
                      <span className="tabular">
                        {formatCurrency(event.restante)}
                      </span>
                    </span>
                  </>
                )}
              </>
            )}
          </span>
        </span>
      </button>

      <div className="flex min-w-[5.75rem] shrink-0 flex-col items-end justify-center gap-0.5 sm:min-w-[7.5rem]">
        <span
          className={cn(
            "tabular whitespace-nowrap text-sm font-semibold leading-5 sm:text-lg",
            isPaid
              ? "text-clay"
              : isOverdue
                ? "text-clay"
                : "text-on-surface",
          )}
        >
          −{formatCurrency(event.total)}
        </span>
        {event.restante > 0 ? (
          <button
            type="button"
            onClick={() => onPay(event)}
            title="Pagar fatura"
            aria-label={`Pagar fatura ${event.cartaoNome}`}
            className={cn(
              "flex h-7 items-center gap-1 text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              statusMeta.tone,
            )}
          >
            <ThumbsDown className="h-4 w-4" aria-hidden="true" />
            {statusMeta.label}
          </button>
        ) : (
          <span
            className={cn(
              "flex h-7 items-center gap-1 text-xs font-medium",
              statusMeta.tone,
            )}
          >
            <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            {statusMeta.label}
          </span>
        )}
      </div>
    </div>
  );
}
