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
        "group relative flex min-h-[72px] w-full items-center gap-2 overflow-hidden rounded-lg border border-grout/80 bg-surface-low px-3 py-3 text-left shadow-[0_4px_16px_rgba(7,16,11,0.45)] transition-colors hover:bg-forest-container/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring sm:gap-3 sm:px-4",
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

      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="row-title">{title}</span>
          <span className="truncate text-xs text-muted-foreground">
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
            className="px-1.5 py-0 text-xs"
          >
            {isOverspent
              ? "estouro"
              : isConsumed
                ? "consumido"
                : isProvision
                  ? "prevista"
                  : (event.status ?? "apurada")}
          </Badge>
        </span>

        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          {isOverspent ? (
            <>
              <span>
                Estourou{" "}
                <span className="tabular text-clay">
                  {formatCurrency(summary.estouro)}
                </span>{" "}
                ({formatCurrency(summary.gasto)} de{" "}
                {formatCurrency(summary.limite)})
              </span>
            </>
          ) : isConsumed ? (
            <span>
              {formatCurrency(summary.gasto)} de{" "}
              {formatCurrency(summary.limite)}
            </span>
          ) : isProvision ? (
            <span>
              Restam{" "}
              <span className="tabular">{formatCurrency(summary.restante)}</span>{" "}
              de {formatCurrency(summary.limite)}
            </span>
          ) : (
            <span>Devolve o que não foi gasto</span>
          )}
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

      <span
        className={cn(
          "row-value shrink-0 self-start pt-0.5",
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
    </button>
  );
}
