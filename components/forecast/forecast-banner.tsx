"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import type { ForecastAlert } from "@/lib/db/queries/forecast";

export function ForecastBanner({
  userId,
  month,
  alert,
}: {
  userId: string;
  month: string;
  alert: ForecastAlert;
}) {
  const key = `verde:forecast-banner:${userId}:${month}`;
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(window.localStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key]);

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(key, "1");
    } catch {
      // Storage indisponível: dispensa só nesta sessão.
    }
  }

  return (
    <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium text-destructive">
          Este mês tem período de saldo negativo na previsão.
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Mínimo de {formatCurrency(alert.menorSaldo)} em{" "}
          {formatDate(alert.menorData)}.{" "}
          <Link href="/previsao" className="font-medium text-primary hover:underline">
            Ver previsão
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar aviso de previsão"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
