"use client";

import { Badge } from "@/components/ui/badge";
import { EntityTile } from "@/components/entity-tile";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import type { BudgetEventView } from "@/lib/db/queries/budgets";
import { formatCurrency, formatDate } from "@/lib/format";
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

  const title = isOverspent
    ? "Estouro do orçamento"
    : isConsumed
      ? "Orçamento consumido"
      : isProvision
        ? "Orçamento"
        : "Sobra do orçamento";

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      aria-label={`${title} ${summary.nome}, ${formatCurrency(
        isAlert ? 0 : event.valor,
      )}`}
      className={cn(
        "flex w-full items-start gap-3 border-l-2 border-dashed px-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4",
        isAlert
          ? "border-l-destructive/60 bg-destructive/[0.06]"
          : isProvision
            ? "border-l-primary/50 bg-primary/[0.04]"
            : "border-l-success/50 bg-success/[0.05]",
      )}
    >
      <EntityTile
        kind="orcamento"
        entity={{
          id: summary.id,
          nome: summary.nome,
          cor: summary.cor,
          icone: summary.icone,
        }}
        size="sm"
        dashed
      />

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{title}</span>
          <span className="truncate text-sm text-muted-foreground">
            {summary.nome}
          </span>
          <Badge
            variant={
              isOverspent
                ? "destructive"
                : isConsumed
                  ? "warning"
                  : isProvision
                    ? "outline"
                    : "success"
            }
          >
            {isOverspent
              ? "estouro"
              : isConsumed
                ? "consumido"
                : isProvision
                  ? "provisão"
                  : (event.status ?? "prevista")}
          </Badge>
        </span>

        <span className="mt-1 block text-xs text-muted-foreground">
          {isOverspent ? (
            <>
              Estourou {formatCurrency(summary.estouro)} (
              {formatCurrency(summary.gasto)} de{" "}
              {formatCurrency(summary.limite)}) · ciclo{" "}
              {formatDate(summary.inicio).slice(0, 5)}–
              {formatDate(summary.fim).slice(0, 5)}
            </>
          ) : isConsumed ? (
            <>
              Orçamento consumido · {formatCurrency(summary.gasto)} de{" "}
              {formatCurrency(summary.limite)} · ciclo{" "}
              {formatDate(summary.inicio).slice(0, 5)}–
              {formatDate(summary.fim).slice(0, 5)}
            </>
          ) : isProvision ? (
            <>
              Restam {formatCurrency(summary.restante)} de{" "}
              {formatCurrency(summary.limite)} · ciclo{" "}
              {formatDate(summary.inicio).slice(0, 5)}–
              {formatDate(summary.fim).slice(0, 5)}
            </>
          ) : (
            <>
              Ciclo {formatDate(summary.inicio).slice(0, 5)}–
              {formatDate(summary.fim).slice(0, 5)} · devolve o que não foi
              gasto
            </>
          )}
        </span>

        <span className="mt-1.5 block max-w-[280px]">
          <BudgetProgress
            gasto={summary.gasto}
            limite={summary.limite}
            size="sm"
            label={`Consumo do orçamento ${summary.nome}`}
          />
        </span>
      </span>

      <span
        className={cn(
          "tabular mt-0.5 shrink-0 text-sm font-semibold",
          isAlert
            ? "text-destructive"
            : isProvision
              ? "text-destructive"
              : "text-success",
        )}
      >
        {isAlert
          ? formatCurrency(0)
          : `${isProvision ? "−" : "+"}${formatCurrency(event.valor)}`}
      </span>
    </button>
  );
}
