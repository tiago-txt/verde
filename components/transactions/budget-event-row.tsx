"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CircleAlert,
} from "lucide-react";
import { EntityTile } from "@/components/entity-tile";
import type { BudgetEventView } from "@/lib/db/queries/budgets";
import { formatCurrency, formatMonthShort, formatMonthTitle } from "@/lib/format";
import { budgetProjectionStatus } from "@/lib/design/row-status";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

type BudgetEventRowProps = {
  event: BudgetEventView;
  onOpen: (event: BudgetEventView) => void;
};

export function BudgetEventRow({ event, onOpen }: BudgetEventRowProps) {
  const summary = event.resumo;
  const isProvision = event.tipoEvento === "provisao";
  const isOverspent = isProvision && summary.estouro > 0;
  const isConsumed = isProvision && !isOverspent && summary.restante === 0;
  const isAlert = isOverspent || isConsumed;
  const projectionStatus = budgetProjectionStatus({
    isProvision,
    estouro: summary.estouro,
    restante: summary.restante,
    status: event.status,
  });
  const statusMeta = {
    prevista: {
      label: "prevista",
      icon: Clock3,
      tone: "text-amber",
      box: "border-amber/35 bg-amber/10",
    },
    apurada: {
      label: "apurada",
      icon: CheckCircle2,
      tone: "text-primary",
      box: "border-primary/35 bg-primary/10",
    },
    estouro: {
      label: "estouro",
      icon: AlertTriangle,
      tone: "text-clay",
      box: "border-clay/40 bg-clay/10",
    },
    consumido: {
      label: "consumido",
      icon: CircleAlert,
      tone: "text-amber",
      box: "border-amber/35 bg-amber/10",
    },
    sobra: {
      label: "sobra",
      icon: CheckCircle2,
      tone: "text-primary",
      box: "border-primary/35 bg-primary/10",
    },
  }[projectionStatus];
  const StatusIcon = statusMeta.icon;
  const isMobile = useIsMobile();

  const sobraReference = formatMonthTitle(
    summary.inicio.slice(0, 7),
  ).replace(/\s\d{2}(\d{2})$/, " $1");
  const descriptor = isProvision
    ? "Orçamento Atual"
    : isMobile
      ? "Sobra do Orçamento Anterior"
      : "Sobra do orçamento anterior";

  const valueTone = isOverspent
    ? "text-clay"
    : isConsumed
      ? "text-amber"
      : isProvision
        ? "text-on-surface"
        : "text-primary";
  const valueText = isAlert
    ? formatCurrency(0)
    : `${isProvision ? "" : "+"}${formatCurrency(event.valor)}`;
  const accentClass = isOverspent
    ? "border-l-destructive/70"
    : isConsumed
      ? "border-l-amber/70"
      : isProvision
        ? "border-l-info/60"
        : "border-l-success/70";
  const subline = isOverspent ? (
    <span>
      Estourado em{" "}
      <span className="tabular text-clay">
        {formatCurrency(summary.estouro)}
      </span>
    </span>
  ) : isConsumed ? (
    <span className="text-amber">Limite consumido</span>
  ) : isProvision ? (
    <span>Disponível para gastar</span>
  ) : (
    <span>referente a {sobraReference}</span>
  );

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      aria-label={`${summary.nome}, ${descriptor}, status ${statusMeta.label}, ${valueText}${
        event.sobraAnterior
          ? `, sobra de ${formatMonthShort(event.sobraAnterior.ciclo)} ${formatCurrency(event.sobraAnterior.valor)}`
          : ""
      }`}
      className={cn(
        "group relative flex min-h-[72px] w-full items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        isMobile
          ? "gap-3 px-0 list-row-cv-virtual"
          : "overflow-hidden rounded-lg border border-grout/80 bg-surface-low px-3 py-3 shadow-[0_4px_16px_rgba(7,16,11,0.45)] transition-colors hover:bg-forest-container/50 sm:gap-3 sm:px-4",
        !isMobile && "opacity-90",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] border-l-2 border-dashed transition-[width] duration-150 lg:group-hover:w-1",
          isMobile && "hidden",
          accentClass,
        )}
      />

      <EntityTile
        kind="orcamento"
        entity={{
          id: summary.id,
          nome: summary.nome,
          cor: summary.cor,
          icone: summary.icone,
        }}
        dashed
        plain={isMobile}
        className={cn("h-10 w-10", !isMobile && "sm:h-12 sm:w-12")}
      />

      <span className={cn("flex-1", isMobile ? "min-w-0" : "min-w-[10rem]")}>
        <span className="row-title block">
          {summary.nome}
          {isMobile ? " · " : " "}
          <span className="text-xs font-normal text-muted-foreground">
            {descriptor}
          </span>
        </span>

        <span
          className={cn(
            "mt-0.5 flex flex-wrap items-center text-[13px] text-muted-foreground",
            "gap-x-1 gap-y-0",
          )}
        >
          {subline}
        </span>

        {event.sobraAnterior && (
          <span className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
            <span>
              {event.sobraAnterior.realocadaPara
                ? `Sobra de ${formatMonthShort(event.sobraAnterior.ciclo)} realocada para ${event.sobraAnterior.realocadaPara.nome}:`
                : `Sobra de ${formatMonthShort(event.sobraAnterior.ciclo)}${
                    event.sobraAnterior.rolada ? " incluída:" : " livre:"
                  }`}
            </span>
            <span className="tabular font-medium text-primary">
              +{formatCurrency(event.sobraAnterior.valor)}
            </span>
          </span>
        )}

        {event.sobraRecebida?.map((item) => (
          <span
            key={`${item.budgetId}:${item.ciclo}`}
            className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-muted-foreground"
          >
            <span>
              Inclui{" "}
              <span className="tabular font-medium text-primary">
                +{formatCurrency(item.valor)}
              </span>{" "}
              de {item.nome} ({formatMonthShort(item.ciclo)})
            </span>
          </span>
        ))}
      </span>

      {isMobile ? (
        <span className="flex shrink-0 flex-col items-end justify-center gap-0.5">
          <span
            className={cn(
              "tabular text-base font-semibold",
              valueTone,
            )}
          >
            {valueText}
          </span>
          <span
            className={cn(
              "flex whitespace-nowrap items-center gap-1 text-xs font-medium capitalize",
              statusMeta.tone,
            )}
          >
            <StatusIcon className="h-4 w-4" aria-hidden="true" />
            {statusMeta.label}
          </span>
        </span>
      ) : (
        <span className="row-slot">
          <span
            className={cn(
              "row-value row-amount",
              valueTone,
            )}
          >
            {valueText}
          </span>
          <span
            className={cn(
              "grid h-12 w-12 shrink-0 place-items-center rounded-lg border",
              statusMeta.box,
              statusMeta.tone,
            )}
            title={`Status: ${statusMeta.label}`}
            aria-label={`Status: ${statusMeta.label}`}
          >
            <StatusIcon className="h-5 w-5" aria-hidden="true" />
          </span>
        </span>
      )}
    </button>
  );
}
