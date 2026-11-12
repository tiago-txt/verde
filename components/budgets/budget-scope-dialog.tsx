"use client";

import { CalendarClock, Layers, Loader2, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormError } from "@/components/form-feedback";
import { formatMonthTitle } from "@/lib/format";
import type { Scope } from "@/lib/finance/scopes";
import { cn } from "@/lib/utils";

type BudgetScopeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budgetNome: string;
  ciclo: string;
  pending: boolean;
  error: string | null;
  onSelect: (scope: Scope) => void;
};

const OPTIONS: {
  scope: Scope;
  title: string;
  description: string;
  icon: typeof Target;
}[] = [
  {
    scope: "single",
    title: "Só este ciclo",
    description:
      "Ajusta só este ciclo como exceção (valor, categorias e fechamento), sem alterar os demais.",
    icon: CalendarClock,
  },
  {
    scope: "future",
    title: "Deste ciclo em diante",
    description: "Encerra a vigência anterior e começa uma nova agora.",
    icon: Layers,
  },
  {
    scope: "all",
    title: "Todos",
    description: "Aplica a mudança a todas as vigências deste orçamento.",
    icon: Target,
  },
];

export function BudgetScopeDialog({
  open,
  onOpenChange,
  budgetNome,
  ciclo,
  pending,
  error,
  onSelect,
}: BudgetScopeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Alterar {budgetNome}</DialogTitle>
          <DialogDescription>
            Como aplicar a mudança a partir de {formatMonthTitle(ciclo)}?
          </DialogDescription>
        </DialogHeader>

        <FormError message={error} />

        <div className="space-y-2">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.scope}
                type="button"
                onClick={() => onSelect(option.scope)}
                disabled={pending}
                className="flex w-full items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Icon
                  className="mt-0.5 h-4 w-4 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{option.title}</span>
                  <span className="block text-xs text-muted-foreground">
                    {option.description}
                  </span>
                </span>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
