"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  Check,
  Loader2,
  Pencil,
  Target,
  Trash2,
  Wallet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CurrencyInput } from "@/components/currency-input";
import { FormError } from "@/components/form-feedback";
import { useToast } from "@/components/ui/toast";
import {
  deleteBudgetAction,
  setBudgetArchivedAction,
  setBudgetOverrideAction,
} from "@/lib/actions/budgets";
import type { BudgetCycleDetail } from "@/lib/db/queries/budgets";
import { formatCurrency, formatDate, formatMonthTitle } from "@/lib/format";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { BudgetProgress } from "./budget-progress";

type BudgetDetailDialogProps = {
  detail: BudgetCycleDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: () => void;
};

export function BudgetDetailDialog({
  detail,
  open,
  onOpenChange,
  onEdit,
}: BudgetDetailDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideValue, setOverrideValue] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open) {
      setOverrideOpen(false);
      setConfirmDelete(false);
      setError(null);
    }
  }, [open]);

  useEffect(() => {
    if (detail) setOverrideValue(detail.resumo.limite);
  }, [detail?.resumo.id, detail?.resumo.ciclo, detail?.resumo.limite]);

  if (!detail) return null;

  const summary = detail.resumo;
  const Icon = getIcon(summary.icone);
  const percent =
    summary.limite > 0
      ? Math.round((summary.gasto / summary.limite) * 100)
      : summary.gasto > 0
        ? 100
        : 0;

  function run(
    action: () => Promise<{ ok: boolean; error?: string }>,
    options?: { success?: string; close?: boolean },
  ) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Não foi possível concluir a ação.");
        return;
      }
      if (options?.success) {
        toast({ description: options.success, tone: "success" });
      }
      if (options?.close) onOpenChange(false);
      router.refresh();
    });
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent variant="right-panel">
          <div className="flex-1 space-y-5 overflow-y-auto p-5 pt-14 sm:pt-14">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                  style={{ backgroundColor: `${summary.cor}22`, color: summary.cor }}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <DialogTitle className="truncate text-lg">
                    {summary.nome}
                  </DialogTitle>
                  <DialogDescription>
                    {formatMonthTitle(summary.ciclo)} ·{" "}
                    {formatDate(summary.inicio).slice(0, 5)} a{" "}
                    {formatDate(summary.fim).slice(0, 5)}
                  </DialogDescription>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">
                  Fecha em {formatDate(summary.fechamento)}
                </Badge>
                {summary.estouro > 0 && (
                  <Badge variant="destructive">
                    <AlertTriangle className="mr-1 h-3 w-3" aria-hidden="true" />
                    Estourou
                  </Badge>
                )}
                {summary.estouro === 0 &&
                  summary.restante === 0 &&
                  summary.gasto > 0 && (
                    <Badge variant="warning">Consumido</Badge>
                  )}
                {summary.arquivado && <Badge variant="secondary">Arquivado</Badge>}
                {summary.antecedenciaCiclos === 1 && (
                  <Badge variant="secondary">1 ciclo antes</Badge>
                )}
              </div>
            </DialogHeader>

            <FormError message={error} />

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">Limite</p>
                <p className="tabular text-sm font-semibold">
                  {formatCurrency(summary.limite)}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">Gasto</p>
                <p className="tabular text-sm font-semibold">
                  {formatCurrency(summary.gasto)}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">
                  {summary.estouro > 0 ? "Estouro" : "Restante"}
                </p>
                <p
                  className={cn(
                    "tabular text-sm font-semibold",
                    summary.estouro > 0
                      ? "text-destructive"
                      : summary.restante === 0
                        ? "text-warning"
                        : "text-success",
                  )}
                >
                  {formatCurrency(
                    summary.estouro > 0 ? summary.estouro : summary.restante,
                  )}
                </p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-[11px] text-muted-foreground">Consumo</p>
                <p className="tabular text-sm font-semibold">{percent}%</p>
              </div>
            </div>

            <BudgetProgress
              gasto={summary.gasto}
              limite={summary.limite}
              label={`Consumo do orçamento ${summary.nome}`}
            />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Categorias
              </p>
              <div className="flex flex-wrap gap-1.5">
                {summary.categories.map((category) => (
                  <Badge key={category.id} variant="outline">
                    <span
                      className="mr-1 h-2 w-2 rounded-full"
                      style={{ backgroundColor: category.cor }}
                    />
                    {category.nome}
                  </Badge>
                ))}
              </div>
              {summary.contaNome && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Wallet className="h-3.5 w-3.5" aria-hidden="true" />
                  Reserva em {summary.contaNome}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">
                  Lançamentos do ciclo
                </p>
                <span className="text-xs text-muted-foreground">
                  {detail.transactions.length}
                </span>
              </div>

              {detail.transactions.length === 0 ? (
                <p className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                  Nenhum lançamento consumiu este ciclo.
                </p>
              ) : (
                <div className="divide-y divide-border rounded-md border border-border">
                  {detail.transactions.map((transaction) => (
                    <Link
                      key={transaction.id}
                      href={`/lancamentos?mes=${transaction.data.slice(0, 7)}&detalhe=${transaction.id}&dias=31`}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="min-w-0">
                        <span className="block truncate">
                          {transaction.descricao}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {formatDate(transaction.data)}
                          {transaction.categoriaNome
                            ? ` · ${transaction.categoriaNome}`
                            : ""}
                          {transaction.pago ? " · pago" : ""}
                        </span>
                      </span>
                      <span className="tabular shrink-0 text-destructive">
                        {formatCurrency(transaction.valor)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {confirmDelete && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                <p className="font-medium">Excluir {summary.nome}?</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Escolha o alcance. Lançamentos nunca são apagados.
                </p>
                <div className="mt-3 grid gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 justify-start"
                    onClick={() =>
                      run(
                        () =>
                          deleteBudgetAction({
                            id: summary.id,
                            ciclo: summary.ciclo,
                            scope: "single",
                          }),
                        {
                          success: "Ciclo excluído.",
                          close: true,
                        },
                      )
                    }
                    disabled={isPending}
                  >
                    Só este ciclo ({formatMonthTitle(summary.ciclo)})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11 justify-start"
                    onClick={() =>
                      run(
                        () =>
                          deleteBudgetAction({
                            id: summary.id,
                            ciclo: summary.ciclo,
                            scope: "future",
                          }),
                        {
                          success: "Série encerrada a partir deste ciclo.",
                          close: true,
                        },
                      )
                    }
                    disabled={isPending}
                  >
                    Este e os próximos
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-11 justify-start"
                    onClick={() =>
                      run(
                        () =>
                          deleteBudgetAction({
                            id: summary.id,
                            scope: "all",
                          }),
                        {
                          success: "Orçamento excluído.",
                          close: true,
                        },
                      )
                    }
                    disabled={isPending}
                  >
                    Todos (série inteira)
                  </Button>
                </div>
                <div className="mt-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-11 sm:h-9"
                    onClick={() => setConfirmDelete(false)}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}

            {overrideOpen && (
              <div className="space-y-2 rounded-lg border border-border p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Valor só de {formatMonthTitle(summary.ciclo)}
                </p>
                <CurrencyInput
                  value={overrideValue}
                  onChange={setOverrideValue}
                  aria-invalid={false}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm" className="h-11 sm:h-9"
                    onClick={() => setOverrideOpen(false)}
                    disabled={isPending}
                  >
                    Cancelar
                  </Button>
                  <Button
                    type="button"
                    size="sm" className="h-11 sm:h-9"
                    onClick={() =>
                      run(
                        () =>
                          setBudgetOverrideAction({
                            budgetId: summary.id,
                            ciclo: summary.ciclo,
                            valorCentavos: overrideValue,
                          }),
                        { success: "Valor deste ciclo ajustado." },
                      )
                    }
                    disabled={isPending || overrideValue <= 0}
                  >
                    {isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Check className="h-3.5 w-3.5" />
                    )}
                    Salvar valor
                  </Button>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex-row items-center justify-between border-t border-border p-3">
            <div className="flex flex-wrap items-center gap-1">
              {onEdit && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm" className="h-11 sm:h-9"
                  onClick={onEdit}
                  disabled={isPending}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm" className="h-11 sm:h-9"
                onClick={() => setOverrideOpen((current) => !current)}
                disabled={isPending}
              >
                <Target className="h-3.5 w-3.5" />
                Ajustar ciclo
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm" className="h-11 sm:h-9"
                onClick={() =>
                  run(
                    () =>
                      setBudgetArchivedAction({
                        id: summary.id,
                        arquivado: !summary.arquivado,
                      }),
                    {
                      success: summary.arquivado
                        ? "Orçamento desarquivado."
                        : "Orçamento arquivado.",
                      close: true,
                    },
                  )
                }
                disabled={isPending}
              >
                {summary.arquivado ? (
                  <ArchiveRestore className="h-3.5 w-3.5" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                {summary.arquivado ? "Desarquivar" : "Arquivar"}
              </Button>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-11 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
