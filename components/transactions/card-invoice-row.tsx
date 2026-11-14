"use client";

import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EntityTile } from "@/components/entity-tile";
import type { CardInvoiceEvent } from "@/lib/db/queries/cards";
import { addDaysISO } from "@/lib/dates";
import { formatCurrency, formatDate } from "@/lib/format";
import { invoiceProjectionStatus } from "@/lib/design/row-status";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
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
    aberta: { label: "aberta", tone: "text-amber", icon: Clock3 },
    fechada: { label: "fechada", tone: "text-info", icon: Clock3 },
    parcial: { label: "parcial", tone: "text-amber", icon: Clock3 },
    paga: { label: "paga", tone: "text-primary", icon: CheckCircle2 },
    vencida: { label: "vencida", tone: "text-clay", icon: AlertTriangle },
  }[projectionStatus];
  const StatusIcon = statusMeta.icon;
  const pagador =
    event.pagamentos.find((item) => Boolean(item.contaNome)) ?? null;
  const outrosPagadores = pagador
    ? event.pagamentos.filter((item) => item.contaId !== pagador.contaId).length
    : 0;
  const pagadorLabel = pagador?.contaNome
    ? `, paga por ${pagador.contaNome}`
    : "";
  const isMobile = useIsMobile();
  const mobileStatusLabel = {
    aberta: "Aberta",
    fechada: "Fechada",
    parcial: "Parcial",
    paga: "Paga",
    vencida: "Vencida",
  }[projectionStatus];

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

  if (isMobile) {
    return (
      <button
        type="button"
        onClick={() => onOpen(event)}
        aria-label={ariaLabel}
        className="list-row-cv-virtual relative flex min-h-[72px] w-full items-center gap-3 px-0 text-left"
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
          className="h-10 w-10"
        />

        <span className="min-w-0 flex-1">
          <span className="row-title block truncate">
            Fatura {event.cartaoNome}
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-1 overflow-hidden text-[13px] text-muted-foreground">
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
                <span className="truncate">{mobileStatusLabel}</span>
              )
            ) : event.restante > 0 ? (
              <span className="truncate">
                restam{" "}
                <span className="tabular">
                  {formatCurrency(event.restante)}
                </span>
              </span>
            ) : null}
          </span>
        </span>

        <span className="flex shrink-0 flex-col items-end justify-center gap-0.5">
          <span
            className={cn(
              "tabular text-base font-semibold",
              isPaid
                ? "text-primary"
                : isOverdue
                  ? "text-clay"
                  : "text-on-surface",
            )}
          >
            −{formatCurrency(event.total)}
          </span>
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              statusMeta.tone,
            )}
          >
            {isPaid ? (
              <ThumbsUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ThumbsDown className="h-4 w-4" aria-hidden="true" />
            )}
            {mobileStatusLabel}
          </span>
        </span>
      </button>
    );
  }

  return (
    <div className="group relative flex min-h-[72px] w-full flex-wrap items-stretch overflow-hidden rounded-lg border border-grout/80 bg-surface-low shadow-[0_4px_16px_rgba(7,16,11,0.45)] opacity-90">
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
        aria-label={`Fatura ${event.cartaoNome}, total ${formatCurrency(event.total)}, restam ${formatCurrency(event.restante)}, vence ${formatDate(event.vencimento)}${pagadorLabel}`}
        className="flex min-w-[10rem] flex-1 items-center gap-2 px-3 py-3 text-left transition-colors hover:bg-forest-container/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-3 sm:px-4"
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
            {pagador && (
              <span className="inline-flex min-w-0 items-center gap-1 rounded-full border border-grout bg-surface-lowest px-2 py-0.5 text-xs text-muted-foreground">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: pagador.contaCor ?? undefined }}
                />
                <span className="truncate">
                  paga por{" "}
                  <span className="font-medium text-foreground/85">
                    {pagador.contaNome ?? "sem conta"}
                  </span>
                </span>
                {outrosPagadores > 0 && (
                  <span
                    className="shrink-0"
                    title={`Mais ${outrosPagadores} conta(s)`}
                  >
                    +{outrosPagadores}
                  </span>
                )}
              </span>
            )}
          </span>

          <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1 font-medium capitalize",
                statusMeta.tone,
              )}
            >
              <StatusIcon className="h-3 w-3" aria-hidden="true" />
              {statusMeta.label}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              pago{" "}
              <span className="tabular">{formatCurrency(event.pago)}</span>
            </span>
            {event.restante > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span>
                  restam{" "}
                  <span className="tabular">
                    {formatCurrency(event.restante)}
                  </span>
                </span>
              </>
            )}
            {!isPaid && (
              <>
                <span aria-hidden="true">·</span>
                <span>vence {formatDate(event.vencimento)}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              ciclo {formatDate(event.inicio).slice(0, 5)}–
              {formatDate(addDaysISO(event.fechamento, -1)).slice(0, 5)}
            </span>
          </span>
        </span>
      </button>

      <div className="row-slot py-3 pr-3 sm:pr-4">
        <span
          className={cn(
            "row-value row-amount",
            isPaid
              ? "text-primary"
              : isOverdue
                ? "text-clay"
                : "text-on-surface",
          )}
        >
          −{formatCurrency(event.total)}
        </span>
        {event.restante > 0 ? (
          <Button
            type="button"
            size="icon"
            variant="outline"
            className="h-12 w-12 shrink-0 border-grout"
            onClick={() => onPay(event)}
            title="Pagar fatura"
            aria-label={`Pagar fatura ${event.cartaoNome}`}
          >
            <Banknote className="h-5 w-5" aria-hidden="true" />
          </Button>
        ) : (
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-primary/35 bg-primary/10 text-primary"
            title="Fatura paga"
            aria-label="Fatura paga"
          >
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );
}
