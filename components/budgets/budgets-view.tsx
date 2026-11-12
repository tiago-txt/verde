"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ChevronLeft,
  ChevronRight,
  Plus,
  Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { MonthPicker } from "@/components/calendar/month-picker";
import { useToast } from "@/components/ui/toast";
import { BudgetDetailDialog } from "./budget-detail-dialog";
import { BudgetFormDialog } from "./budget-form-dialog";
import { BudgetScopeDialog } from "./budget-scope-dialog";
import { BudgetProgress, budgetTone } from "./budget-progress";
import {
  createBudgetAction,
  restoreBudgetCycleAction,
  updateBudgetAction,
} from "@/lib/actions/budgets";
import type {
  BudgetCycleDetail,
  BudgetFormData,
  BudgetWithCategories,
} from "@/lib/db/queries/budgets";
import type { Scope } from "@/lib/finance/scopes";
import type { BudgetFormValues } from "@/lib/validation/budgets";
import { addMonths } from "@/lib/dates";
import { formatCurrency, formatDate, formatMonthTitle } from "@/lib/format";
import { EntityTile } from "@/components/entity-tile";
import { cn } from "@/lib/utils";

type BudgetsViewProps = {
  ciclo: string;
  details: BudgetCycleDetail[];
  formData: BudgetFormData;
  incluirArquivados: boolean;
  initialBudgetId: string | null;
  excludedCycles: { budgetId: string; nome: string }[];
};

function relevantChange(
  budget: BudgetWithCategories,
  values: BudgetFormValues,
): boolean {
  if (budget.valorPadrao !== values.valorPadrao) return true;
  if (budget.diaFechamento !== values.diaFechamento) return true;
  if (budget.dataInicio !== values.dataInicio) return true;
  if ((budget.dataFim ?? null) !== (values.dataFim ?? null)) return true;
  if ((budget.cartaoId ?? null) !== (values.cartaoId ?? null)) return true;
  if (budget.origens !== values.origens) return true;
  const before = budget.categories.map((category) => category.id).sort();
  const after = [...values.categoriaIds].sort();
  return (
    before.length !== after.length ||
    before.some((id, index) => id !== after[index])
  );
}

export function BudgetsView({
  ciclo,
  details,
  formData,
  incluirArquivados,
  initialBudgetId,
  excludedCycles,
}: BudgetsViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<BudgetWithCategories | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const [scopeOpen, setScopeOpen] = useState(false);
  const [scopeError, setScopeError] = useState<string | null>(null);
  const [pendingValues, setPendingValues] = useState<BudgetFormValues | null>(
    null,
  );
  const openedInitial = useRef(false);

  const totals = useMemo(() => {
    return details.reduce(
      (acc, detail) => {
        const summary = detail.resumo;
        acc.limites += summary.limite;
        acc.gastos += summary.gasto;
        acc.restantes += summary.restante;
        acc.estouro += summary.estouro;
        return acc;
      },
      { limites: 0, gastos: 0, restantes: 0, estouro: 0 },
    );
  }, [details]);

  const selectedDetail = details.find(
    (detail) => detail.resumo.id === detailId,
  ) ?? null;

  useEffect(() => {
    if (!initialBudgetId || openedInitial.current) return;
    const detail = details.find(
      (item) => item.resumo.id === initialBudgetId,
    );
    if (!detail) return;
    openedInitial.current = true;
    setEditing(detail.resumo);
    setFormOpen(true);
  }, [initialBudgetId, details]);

  function changeCycle(next: string) {
    const params = new URLSearchParams();
    params.set("ciclo", next);
    if (incluirArquivados) params.set("arquivados", "1");
    router.push(`/limite-de-gastos?${params.toString()}`);
  }

  function toggleArchived() {
    const params = new URLSearchParams();
    params.set("ciclo", ciclo);
    if (!incluirArquivados) params.set("arquivados", "1");
    router.push(`/limite-de-gastos?${params.toString()}`);
  }

  async function handleFormSubmit(
    values: BudgetFormValues,
    changed: boolean,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!editing) {
      const result = await createBudgetAction(values);
      if (result.ok) {
        toast({ description: "Orçamento criado.", tone: "success" });
        router.refresh();
      }
      return { ok: result.ok, error: result.ok ? undefined : result.error };
    }

    if (changed) {
      setPendingValues(values);
      setScopeError(null);
      setScopeOpen(true);
      return { ok: true };
    }

    // Sem mudanças: não regrava a série (isso apagaria exceções existentes).
    return { ok: true };
  }

  function applyScope(scope: Scope) {
    if (!editing || !pendingValues) return;
    setScopeError(null);
    startTransition(async () => {
      const result = await updateBudgetAction({
        ...pendingValues,
        id: editing.id,
        scope,
        ciclo,
      });
      if (!result.ok) {
        setScopeError(result.error);
        return;
      }
      setScopeOpen(false);
      setPendingValues(null);
      setEditing(null);
      toast({
        description:
          scope === "single"
            ? "Valor do ciclo ajustado."
            : "Orçamento atualizado.",
        tone: "success",
      });
      router.refresh();
    });
  }

  function openEdit(budget: BudgetWithCategories) {
    setEditing(budget);
    setFormOpen(true);
  }

  function restoreCycle(item: { budgetId: string; nome: string }) {
    startTransition(async () => {
      const result = await restoreBudgetCycleAction({
        id: item.budgetId,
        ciclo,
      });
      if (!result.ok) {
        toast({ description: result.error, tone: "warning" });
        return;
      }
      toast({ description: "Ciclo restaurado.", tone: "success" });
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold">Orçamentos</h1>
          <p className="text-xs text-muted-foreground">
            Envelopes por ciclo, com fechamento próprio. O gasto real continua
            nos lançamentos.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Novo orçamento</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Ciclo anterior"
            onClick={() => changeCycle(addMonths(ciclo, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <MonthPicker
            month={ciclo}
            onChange={changeCycle}
            className="text-center"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Próximo ciclo"
            onClick={() => changeCycle(addMonths(ciclo, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <Badge variant="secondary">
          Ciclo de {formatMonthTitle(ciclo)}
        </Badge>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-11"
          onClick={toggleArchived}
          aria-pressed={incluirArquivados}
        >
          <Archive className="h-4 w-4" />
          {incluirArquivados ? "Ocultar arquivados" : "Mostrar arquivados"}
        </Button>
      </div>

      {excludedCycles.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="text-sm font-medium">
            Ciclos excluídos em {formatMonthTitle(ciclo)}
          </p>
          <p className="mb-2 text-xs text-muted-foreground">
            Eles não consomem gastos nem geram reserva. Você pode restaurar.
          </p>
          <div className="flex flex-wrap gap-2">
            {excludedCycles.map((item) => (
              <Button
                key={item.budgetId}
                type="button"
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => restoreCycle(item)}
                disabled={isPending}
              >
                Restaurar {item.nome}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Total label="Limites" value={totals.limites} />        <Total label="Gastos" value={totals.gastos} tone="text-destructive" />
        <Total
          label="Restantes"
          value={totals.restantes}
          tone="text-success"
        />
        <Total
          label="Estourado"
          value={totals.estouro}
          tone={totals.estouro > 0 ? "text-destructive" : undefined}
        >
          {totals.estouro > 0 && (
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </Total>
      </div>

      {details.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <EmptyState
            icon={Target}
            title={
              excludedCycles.length > 0
                ? "Nenhum orçamento ativo neste ciclo"
                : "Crie seu primeiro orçamento"
            }
            description={
              excludedCycles.length > 0
                ? "Os ciclos excluídos aparecem acima e podem ser restaurados."
                : "Defina um valor por ciclo e sincronize as categorias que ele deve cobrir."
            }
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Novo orçamento
              </Button>
            }
          />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {details.map((detail) => {
            const summary = detail.resumo;
            const tone = budgetTone(summary.gasto, summary.limite);
            return (
              <button
                key={summary.id}
                type="button"
                onClick={() => setDetailId(summary.id)}
                className={cn(
                  "flex h-full flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  summary.arquivado && "opacity-70",
                )}
              >
                <div className="flex items-start gap-3">
                  <EntityTile
                    kind="orcamento"
                    entity={{
                      id: summary.id,
                      nome: summary.nome,
                      cor: summary.cor,
                      icone: summary.icone,
                    }}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">
                        {summary.nome}
                      </span>
                      {summary.estouro > 0 && (
                        <Badge variant="destructive">Estourou</Badge>
                      )}
                      {summary.estouro === 0 &&
                        summary.restante === 0 &&
                        summary.gasto > 0 && (
                          <Badge variant="warning">Consumido</Badge>
                        )}
                      {summary.estouro === 0 &&
                        summary.restante > 0 &&
                        summary.gasto / Math.max(1, summary.limite) >= 0.8 && (
                          <Badge variant={tone.badge}>{summary.percentual}%</Badge>
                        )}
                      {summary.arquivado && (
                        <Badge variant="secondary">Arquivado</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(summary.inicio).slice(0, 5)} a{" "}
                      {formatDate(summary.fim).slice(0, 5)} ·{" "}
                      fecha {formatDate(summary.fechamento).slice(0, 5)}
                    </p>
                  </div>
                </div>

                <BudgetProgress
                  gasto={summary.gasto}
                  limite={summary.limite}
                  label={`Consumo do orçamento ${summary.nome}`}
                />

                <div className="flex items-baseline justify-between gap-2">
                  <p className="tabular text-sm font-semibold">
                    {formatCurrency(summary.gasto)}
                    <span className="text-xs font-normal text-muted-foreground">
                      {" "}
                      de {formatCurrency(summary.limite)}
                    </span>
                  </p>
                  <p
                    className={cn(
                      "tabular shrink-0 text-xs font-medium",
                      summary.estouro > 0
                        ? "text-destructive"
                        : summary.restante === 0
                          ? "text-warning"
                          : "text-success",
                    )}
                  >
                    {summary.estouro > 0
                      ? `+${formatCurrency(summary.estouro)}`
                      : `restam ${formatCurrency(summary.restante)}`}
                  </p>
                </div>

                {summary.estouro > 0 && (
                  <p className="text-xs font-medium text-destructive">
                    Estourou {formatCurrency(summary.estouro)} neste ciclo
                  </p>
                )}

                <div className="flex flex-wrap gap-1">
                  {summary.categories.slice(0, 4).map((category) => (
                    <Badge key={category.id} variant="outline">
                      {category.nome}
                    </Badge>
                  ))}
                  {summary.categories.length > 4 && (
                    <Badge variant="outline">
                      +{summary.categories.length - 4}
                    </Badge>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <BudgetFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
        }}
        budget={editing}
        formData={formData}
        ciclo={ciclo}
        onSubmit={handleFormSubmit}
      />

      <BudgetScopeDialog
        open={scopeOpen}
        onOpenChange={(open) => {
          setScopeOpen(open);
          if (!open) setPendingValues(null);
        }}
        budgetNome={editing?.nome ?? "orçamento"}
        ciclo={ciclo}
        pending={isPending}
        error={scopeError}
        onSelect={applyScope}
      />

      <BudgetDetailDialog
        detail={selectedDetail}
        open={Boolean(selectedDetail)}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
        onEdit={() => {
          if (selectedDetail) {
            setDetailId(null);
            openEdit(selectedDetail.resumo);
          }
        }}
      />
    </div>
  );
}

function Total({
  label,
  value,
  tone,
  children,
}: {
  label: string;
  value: number;
  tone?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        {label}
        {children}
      </p>
      <p className={cn("tabular truncate text-sm font-semibold", tone)}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}
