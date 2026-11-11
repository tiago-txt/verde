"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LancamentosError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[verde] erro em lançamentos:", error);
  }, [error]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/15 text-destructive">
          <AlertTriangle className="h-6 w-6" aria-hidden="true" />
        </span>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">
            Não foi possível carregar os lançamentos
          </h1>
          <p className="text-sm text-muted-foreground">
            Ocorreu um erro ao buscar os dados. Tente novamente; se persistir,
            verifique os logs do container.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground">
              Código: {error.digest}
            </p>
          )}
        </div>
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Tentar novamente
        </Button>
      </div>
    </div>
  );
}
