"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  CircleAlert,
} from "lucide-react";
import { EntityTile } from "@/components/entity-tile";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import type { BudgetEventView } from "@/lib/db/queries/budgets";
import { formatCurrency, formatDate } from "@/lib/format";
import { budgetProjectionStatus } from "@/lib/design/row-status";
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

  const title = isProvision ? "Orçamento" : "Sobra do orçamento";

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      aria-label={`${title} ${summary.nome}, status ${statusMeta.label}, ${formatCurrency(
        isAlert ? 0 : event.valor,
      )}`}
      className={cn(
        "group relative flex min-h-[72px] w-full flex-wrap items-center gap-2 overflow-hidden rounded-lg border border-grout/80 bg-surface-low px-3 py-3 text-left shadow-[0_4px_16px_rgba(7,16,11,0.45)] transition-colors hover:bg-forest-container/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-3 sm:px-4",
        "opacity-90",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 w-[3px] border-l-2 border-dashed transition-[width] duration-150 lg:group-hover:w-1",
          isAlert
            ? "border-l-destructive/70"
            : isProvision
              ? "border-l-primary/70"
              : "border-l-success/70",
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
        className="h-10 w-10 sm:h-12 sm:w-12"
      />

      <span className="min-w-[10rem] flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="row-title">{title}</span>
          <span className="truncate text-xs text-muted-foreground">
            {summary.nome}
          </span>
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          <span className={cn("font-medium", statusMeta.tone)}>
            {statusMeta.label}
          </span>
          {isOverspent || (isProvision && !isConsumed) ? (
            <>
              <span aria-hidden="true">·</span>
              {isOverspent ? (
                <span>
                  Estourou{" "}
                  <span className="tabular text-clay">
                    {formatCurrency(summary.estouro)}
                  </span>
                </span>
              ) : (
                <span>
                  Restam{" "}
                  <span className="tabular">
                    {formatCurrency(summary.restante)}
                  </span>
                </span>
              )}
            </>
          ) : null}
          <span aria-hidden="true">·</span>
          <span>
            ciclo {formatDate(summary.inicio).slice(0, 5)}–
            {formatDate(summary.fim).slice(0, 5)}
          </span>
        </span>

        <span className="mt-1 block max-w-[280px]">
          <BudgetProgress
            gasto={summary.gasto}
            limite={summary.limite}
            size="sm"
            label={`Consumo do orçamento ${summary.nome}`}
          />
        </span>
      </span>

      <span className="row-slot">
        <span
          className={cn(
            "row-value row-amount",
            isAlert
              ? "text-clay"
              : isProvision
                ? "text-clay"
                : "text-primary",
          )}
        >
          {isAlert
            ? formatCurrency(0)
            : `${isProvision ? "−" : "+"}${formatCurrency(event.valor)}`}
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
    </button>
  );
}
