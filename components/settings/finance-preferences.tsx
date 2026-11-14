"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-feedback";
import { saveCardBasisAction } from "@/lib/actions/preferences";
import {
  CARD_BASES,
  CARD_BASIS_HELP,
  CARD_BASIS_LABELS,
  type CardBasis,
} from "@/lib/finance/result";
import { cn } from "@/lib/utils";

export function FinancePreferences({ cardBasis }: { cardBasis: CardBasis }) {
  const router = useRouter();
  const [selected, setSelected] = useState<CardBasis>(cardBasis);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function choose(next: CardBasis) {
    if (next === selected) return;
    setSelected(next);
    setError(null);
    startTransition(async () => {
      const result = await saveCardBasisAction({ cardBasis: next });
      if (!result.ok) {
        setSelected(selected);
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-sm font-medium">Base das compras no cartão</p>
        <p className="text-xs text-muted-foreground">
          Vale para o resultado do mês, o rodapé de Lançamentos e os relatórios.
          Não altera saldo, patrimônio nem previsão.
        </p>
      </div>
      <div
        role="radiogroup"
        aria-label="Base das compras no cartão"
        className="grid gap-2 sm:grid-cols-2"
      >
        {CARD_BASES.map((value) => {
          const active = selected === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              disabled={pending}
              onClick={() => choose(value)}
              className={cn(
                "min-h-12 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70",
                active
                  ? "border-primary/50 bg-primary/10"
                  : "border-border hover:bg-accent",
              )}
            >
              <span
                className={cn(
                  "block text-sm font-medium",
                  active ? "text-primary" : "text-foreground",
                )}
              >
                {CARD_BASIS_LABELS[value]}
                {value === "caixa" && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    padrão
                  </span>
                )}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                {CARD_BASIS_HELP[value]}
              </span>
            </button>
          );
        })}
      </div>
      <FormError message={error} />
      {pending && (
        <p className="text-xs text-muted-foreground">Salvando preferência…</p>
      )}
    </div>
  );
}
