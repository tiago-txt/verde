"use client";

import { useEffect, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/currency-input";
import { FormError } from "@/components/form-feedback";
import {
  closeBudgetCycleAction,
  reopenBudgetCycleAction,
  updateBudgetAction,
} from "@/lib/actions/budgets";
import type { BudgetCycleSummary } from "@/lib/db/queries/budgets";
import type { BudgetFormValues } from "@/lib/validation/budgets";
import { formatMonthTitle } from "@/lib/format";

type BudgetQuickEditDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: BudgetCycleSummary | null;
  onSaved: () => void;
};

export function BudgetQuickEditDialog({
  open,
  onOpenChange,
  budget,
  onSaved,
}: BudgetQuickEditDialogProps) {
  const [nome, setNome] = useState("");
  const [valor, setValor] = useState(0);
  const [fechado, setFechado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open || !budget) return;
    setNome(budget.nome);
    setValor(budget.valorPadrao);
    setFechado(budget.fechado);
    setError(null);
  }, [open, budget]);

  if (!budget) return null;

  function save() {
    if (!budget) return;
    const nomeFinal = nome.trim();
    if (!nomeFinal) {
      setError("Informe um nome.");
      return;
    }
    if (valor <= 0) {
      setError("O valor deve ser maior que zero.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const detailsChanged =
        nomeFinal !== budget.nome || valor !== budget.valorPadrao;

      if (detailsChanged) {
        const result = await updateBudgetAction({
          id: budget.id,
          ciclo: budget.ciclo,
          scope: "single",
          nome: nomeFinal,
          valorPadrao: valor,
          diaFechamento: budget.diaFechamento,
          antecedenciaCiclos: budget.antecedenciaCiclos === 1 ? 1 : 0,
          origens: budget.origens,
          sobraPolicy: budget.sobraPolicy,
          sobraDestinoBudgetId: budget.sobraDestinoBudgetId,
          sobraApenasAoFechar: budget.sobraApenasAoFechar,
          periodicidadeMeses: budget.periodicidadeMeses,
          baseValorPeriodo: budget.baseValorPeriodo,
          categoriaIds: budget.categories.map((category) => category.id),
          contaId: budget.contaId,
          cartaoId: budget.cartaoId,
          cor: budget.cor,
          icone: budget.icone as BudgetFormValues["icone"],
          dataInicio: budget.dataInicio,
          dataFim: budget.dataFim,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }

      if (fechado !== budget.fechado) {
        const input = { budgetId: budget.id, ciclo: budget.ciclo };
        const result = fechado
          ? await closeBudgetCycleAction(input)
          : await reopenBudgetCycleAction(input);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }

      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar orçamento</DialogTitle>
          <DialogDescription>
            Ajuste rápido de {formatMonthTitle(budget.ciclo)}. As demais
            configurações continuam na tela de Orçamentos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="quick-budget-nome">Nome</Label>
            <Input
              id="quick-budget-nome"
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              maxLength={80}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="quick-budget-valor">Valor do ciclo</Label>
            <CurrencyInput
              id="quick-budget-valor"
              value={valor}
              onChange={setValor}
            />
          </div>

          <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <Label htmlFor="quick-budget-fechado" className="text-sm">
                Ciclo fechado
              </Label>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Fechar consolida a sobra; reabrir volta a reservar o restante.
              </p>
            </div>
            <Switch
              id="quick-budget-fechado"
              checked={fechado}
              onCheckedChange={setFechado}
            />
          </div>

          <FormError message={error} />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
          <Button type="button" onClick={save} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
