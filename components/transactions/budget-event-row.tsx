"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CircleAlert,
  Loader2,
  Lock,
} from "lucide-react";
import { EntityTile } from "@/components/entity-tile";
import type { BudgetEventView } from "@/lib/db/queries/budgets";
import { formatCurrency, formatMonthShort, formatMonthTitle } from "@/lib/format";
import { budgetProjectionStatus } from "@/lib/design/row-status";
import { cn } from "@/lib/utils";

type BudgetEventRowProps = {
  event: BudgetEventView;
  onOpen: (event: BudgetEventView) => void;
  onToggleCycle?: (event: BudgetEventView) => void;
  cyclePending?: boolean;
};

export function BudgetEventRow({
  event,
  onOpen,
  onToggleCycle,
  cyclePending = false,
}: BudgetEventRowProps) {
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
  const closedMeta = {
    label: "fechado",
    icon: Lock,
    tone: "text-primary",
    box: "border-primary/35 bg-primary/10",
  };
  const displayMeta =
    isProvision && summary.fechado ? closedMeta : statusMeta;
  const DisplayIcon = displayMeta.icon;

  const sobraReference = formatMonthTitle(
    summary.inicio.slice(0, 7),
  ).replace(/\s\d{2}(\d{2})$/, " $1");
  const descriptor = isProvision
    ? "Orçamento atual"
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
    <div className="list-row-cv-virtual group relative flex min-h-[72px] w-full items-center gap-2.5 pl-2.5 pr-0 text-left max-sm:py-1 sm:gap-3 lg:hover:bg-forest-container/60">
      <button
        type="button"
        onClick={() => onOpen(event)}
        aria-label={`${summary.nome}, ${descriptor}, status ${statusMeta.label}, ${valueText}${
          event.sobraAnterior
            ? `, sobra de ${formatMonthShort(event.sobraAnterior.ciclo)} ${formatCurrency(event.sobraAnterior.valor)}`
            : ""
        }`}
        className="absolute inset-0 z-0 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />

      <div className="pointer-events-none relative z-10 flex w-full min-w-0 items-center gap-2.5 sm:gap-3">
        <EntityTile
          kind="orcamento"
          entity={{
            id: summary.id,
            nome: summary.nome,
            cor: summary.cor,
            icone: summary.icone,
          }}
          dashed
          plain
          className="h-9 w-9 sm:h-10 sm:w-10"
        />

        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-start justify-between gap-2">
            <span className="row-title block min-w-0 flex-1">
              {summary.nome}
              {" · "}
              <span className="text-xs font-normal text-muted-foreground">
                {descriptor}
              </span>
            </span>
            <span
              className={cn(
                "tabular shrink-0 whitespace-nowrap pt-0.5 text-right text-sm font-semibold leading-5 sm:text-lg",
                valueTone,
              )}
            >
              {valueText}
            </span>
          </span>

          <span className="mt-1.5 flex min-w-0 items-start justify-between gap-2">
            <span className="min-w-0 flex-1">
              <span
                className={cn(
                  "flex flex-wrap items-center text-xs text-muted-foreground sm:text-sm",
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

            <span className="flex shrink-0 items-center gap-1">
              {isProvision && onToggleCycle ? (
                <button
                  type="button"
                  onClick={(clickEvent) => {
                    clickEvent.stopPropagation();
                    onToggleCycle(event);
                  }}
                  disabled={cyclePending}
                  aria-label={
                    summary.fechado
                      ? `Reabrir o ciclo ${formatMonthTitle(summary.ciclo)} de ${summary.nome}`
                      : `Fechar o ciclo ${formatMonthTitle(summary.ciclo)} de ${summary.nome}`
                  }
                  title={summary.fechado ? "Reabrir ciclo" : "Fechar ciclo"}
                  className={cn(
                    "pointer-events-auto flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize transition-colors hover:brightness-110 disabled:opacity-50",
                    displayMeta.box,
                    displayMeta.tone,
                  )}
                >
                  {cyclePending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <DisplayIcon className="h-4 w-4" aria-hidden="true" />
                  )}
                  {displayMeta.label}
                </button>
              ) : (
                <span
                  className={cn(
                    "flex shrink-0 whitespace-nowrap items-center gap-1 text-xs font-medium capitalize",
                    displayMeta.tone,
                  )}
                  title={`Status: ${displayMeta.label}`}
                  aria-label={`Status: ${displayMeta.label}`}
                >
                  <DisplayIcon className="h-4 w-4" aria-hidden="true" />
                  {displayMeta.label}
                </span>
              )}
            </span>
          </span>
        </span>
      </div>
    </div>
  );
}
