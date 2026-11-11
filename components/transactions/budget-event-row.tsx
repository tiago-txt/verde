"use client";

import { AlertTriangle, PiggyBank } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { BudgetProgress } from "@/components/budgets/budget-progress";
import type { BudgetEventView } from "@/lib/db/queries/budgets";
import { formatCurrency, formatDate } from "@/lib/format";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type BudgetEventRowProps = {
  event: BudgetEventView;
  onOpen: (event: BudgetEventView) => void;
};

export function BudgetEventRow({ event, onOpen }: BudgetEventRowProps) {
  const summary = event.resumo;
  const isProvision = event.tipoEvento === "provisao";
  const isOverspend = event.tipoEvento === "estouro";
  const Icon = isOverspend
    ? AlertTriangle
    : isProvision
      ? getIcon(summary.icone)
      : PiggyBank;

  return (
    <button
      type="button"
      onClick={() => onOpen(event)}
      aria-label={`${
        isOverspend
          ? "Estouro do orçamento"
          : isProvision
            ? "Orçamento"
            : "Sobra do orçamento"
      } ${summary.nome}, ${formatCurrency(event.valor)}`}
      className={cn(
        "flex w-full items-start gap-3 border-l-2 border-dashed px-3 py-3 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:px-4",
        isOverspend
          ? "border-l-destructive/60 bg-destructive/[0.06]"
          : isProvision
            ? "border-l-primary/50 bg-primary/[0.04]"
            : "border-l-success/50 bg-success/[0.05]",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl",
          isOverspend
            ? "bg-destructive/10 text-destructive"
            : isProvision
              ? "bg-primary/10 text-primary"
              : "bg-success/10 text-success",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">
            {isOverspend
              ? "Estouro do orçamento"
              : isProvision
                ? "Orçamento"
                : "Sobra do orçamento"}
          </span>
          <span className="truncate text-sm text-muted-foreground">
            {summary.nome}
          </span>
          <Badge
            variant={
              isOverspend ? "destructive" : isProvision ? "outline" : "success"
            }
          >
            {isOverspend
              ? "estouro"
              : isProvision
                ? "provisão"
                : (event.status ?? "prevista")}
          </Badge>
        </span>

        <span className="mt-1 block text-[11px] text-muted-foreground">
          {isOverspend ? (
            <>
              Estourou {formatCurrency(summary.estouro)} de{" "}
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
          isOverspend
            ? "text-destructive"
            : isProvision
              ? "text-destructive"
              : "text-success",
        )}
      >
        {isOverspend || isProvision ? "−" : "+"}
        {formatCurrency(event.valor)}
      </span>
    </button>
  );
}
