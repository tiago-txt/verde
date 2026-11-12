"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CurrencyInput } from "@/components/currency-input";
import { EntityTile } from "@/components/entity-tile";
import { FormError } from "@/components/form-feedback";
import { saveForecastPreferencesAction } from "@/lib/actions/forecast";
import type { ForecastAccount, ForecastHorizon } from "@/lib/finance/forecast";

type ForecastPreferences = {
  horizonte: ForecastHorizon;
  margem: number;
  contas: string[];
  incluirEstimativas: boolean;
};

export function ForecastControls({
  prefs,
  contas,
}: {
  prefs: ForecastPreferences;
  contas: ForecastAccount[];
}) {
  const router = useRouter();
  const [state, setState] = useState(prefs);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accountsOpen, setAccountsOpen] = useState(false);

  function apply(next: ForecastPreferences) {
    if (next.contas.length === 0) {
      setError("Escolha pelo menos uma conta.");
      return;
    }
    setError(null);
    setState(next);
    startTransition(async () => {
      const result = await saveForecastPreferencesAction(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function toggleConta(id: string) {
    const next = state.contas.includes(id)
      ? state.contas.filter((item) => item !== id)
      : [...state.contas, id];
    setState({ ...state, contas: next });
  }

  const accountLabel =
    state.contas.length === contas.length
      ? "Todas as contas"
      : `${state.contas.length} conta(s)`;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Horizonte
        </span>
        {([6, 12, 24] as const).map((horizonte) => (
          <Button
            key={horizonte}
            type="button"
            size="sm"
            variant={state.horizonte === horizonte ? "default" : "outline"}
            className="h-12 min-w-16 sm:h-9"
            disabled={pending}
            aria-pressed={state.horizonte === horizonte}
            onClick={() => apply({ ...state, horizonte })}
          >
            {horizonte} meses
          </Button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="forecast-margem" className="text-xs">
            Margem de segurança
          </Label>
          <CurrencyInput
            id="forecast-margem"
            value={state.margem}
            disabled={pending}
            className="h-12 sm:h-11"
            onChange={(margem) => setState({ ...state, margem })}
            onBlur={() => apply(state)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                apply(state);
              }
            }}
          />
          <p className="text-xs text-muted-foreground">
            O saldo abaixo deste valor é tratado como negativo.
          </p>
        </div>

        <div className="space-y-1">
          <span className="text-xs">Estimativas</span>
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-md border border-border px-3">
            <span className="text-xs">Incluir estimativas</span>
            <Switch
              checked={state.incluirEstimativas}
              disabled={pending}
              onCheckedChange={(incluirEstimativas) =>
                apply({ ...state, incluirEstimativas })
              }
              aria-label="Incluir estimativas na previsão"
            />
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-xs">Contas incluídas</span>
          <Button
            type="button"
            variant="outline"
            className="h-12 w-full justify-start sm:hidden"
            onClick={() => setAccountsOpen(true)}
            disabled={pending}
          >
            <SlidersHorizontal className="h-4 w-4" />
            {accountLabel}
          </Button>
          <div className="hidden max-h-28 space-y-1 overflow-y-auto rounded-md border border-border p-2 sm:block">
            {contas.map((conta) => (
              <label
                key={conta.id}
                className="flex min-h-8 cursor-pointer items-center gap-2 text-xs"
              >
                <Checkbox
                  checked={state.contas.includes(conta.id)}
                  onCheckedChange={() => toggleConta(conta.id)}
                  aria-label={`Incluir ${conta.nome}`}
                />
                <EntityTile
                  kind="conta"
                  entity={{
                    id: conta.id,
                    nome: conta.nome,
                    cor: conta.cor,
                    icone: conta.icone,
                  }}
                  size="xs"
                />
                <span className="truncate">{conta.nome}</span>
              </label>
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="hidden h-12 px-0 text-xs sm:inline-flex sm:h-8"
            onClick={() => apply(state)}
            disabled={pending}
          >
            Aplicar contas
          </Button>
        </div>
      </div>

      <FormError message={error} />
      {pending && (
        <p className="text-xs text-muted-foreground">Atualizando previsão…</p>
      )}

      <Dialog open={accountsOpen} onOpenChange={setAccountsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Contas na previsão</DialogTitle>
            <DialogDescription>
              Transferências entre contas incluídas se anulam no total.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            {contas.map((conta) => (
              <label
                key={conta.id}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg px-2 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={state.contas.includes(conta.id)}
                  onCheckedChange={() => toggleConta(conta.id)}
                  aria-label={`Incluir ${conta.nome}`}
                />
                <EntityTile
                  kind="conta"
                  entity={{
                    id: conta.id,
                    nome: conta.nome,
                    cor: conta.cor,
                    icone: conta.icone,
                  }}
                  size="sm"
                />
                <span className="truncate">{conta.nome}</span>
              </label>
            ))}
          </div>
          <FormError message={error} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-12 sm:h-10"
              onClick={() => setAccountsOpen(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="h-12 sm:h-10"
              disabled={pending || state.contas.length === 0}
              onClick={() => {
                apply(state);
                setAccountsOpen(false);
              }}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
