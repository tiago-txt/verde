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
    <div className="relative flex items-start gap-3 overflow-hidden rounded-lg border border-grout bg-surface-low p-3 text-xs shadow-[0_12px_28px_-6px_rgba(7,16,11,0.9)]">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-2.5 bg-amber shadow-[0_0_12px_hsl(var(--amber)/.55)]"
      />
      <span
        aria-hidden="true"
        className="decor-glow pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-primary/10 blur-2xl"
      />
      <span className="tile ml-1 grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-grout bg-forest-high text-amber">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-on-surface">
          Este mês tem período de saldo negativo na previsão.
        </p>
        <p className="mt-0.5 text-muted-foreground">
          Mínimo de{" "}
          <span className="tabular font-semibold text-clay">
            {formatCurrency(alert.menorSaldo)}
          </span>{" "}
          em {formatDate(alert.menorData)}.{" "}
          <Link href="/previsao" className="font-semibold text-primary hover:underline">
            Ver previsão
          </Link>
        </p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dispensar aviso de previsão"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-lg text-outline hover:bg-forest-high hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
