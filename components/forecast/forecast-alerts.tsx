"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatMonthShort } from "@/lib/format";
import type { ForecastAlert } from "@/lib/db/queries/forecast";

export function ForecastAlerts({
  alertas,
  onSelect,
}: {
  alertas: ForecastAlert[];
  onSelect?: (alert: ForecastAlert | null) => void;
}) {
  const [selected, setSelected] = useState<number | null>(
    alertas.length > 0 ? 0 : null,
  );

  useEffect(() => {
    if (selected !== null && selected >= alertas.length) {
      setSelected(alertas.length > 0 ? 0 : null);
    }
  }, [alertas.length, selected]);

  if (alertas.length === 0) return null;

  return (
    <div className="space-y-2">
      {alertas.map((alert, index) => {
        const active = selected === index;
        return (
          <div
            key={`${alert.inicio}:${alert.fim}`}
            className={`rounded-xl border p-3 transition-colors ${
              active
                ? "border-destructive/50 bg-destructive/5"
                : "border-border bg-card"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                const next = active ? null : index;
                setSelected(next);
                onSelect?.(next === null ? null : alert);
              }}
              className="flex min-h-12 w-full items-start justify-between gap-3 text-left"
            >
              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Saldo negativo
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(alert.inicio)} a {formatDate(alert.fim)}
                  </span>
                </span>
                <span className="mt-1 block text-sm font-medium">
                  Menor saldo: {formatCurrency(alert.menorSaldo)} em{" "}
                  {formatDate(alert.menorData)}
                </span>
              </span>
              <ArrowRight
                className={`mt-1 h-4 w-4 shrink-0 transition-transform ${
                  active ? "rotate-90" : ""
                }`}
                aria-hidden="true"
              />
            </button>

            {active && (
              <div className="mt-2 space-y-2 border-t border-border/70 pt-2">
                {alert.causas.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground">
                      Maiores causas
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {alert.causas.slice(0, 4).map((cause) => (
                        <li key={cause.chave} className="flex justify-between gap-2">
                          <span className="truncate">{cause.label}</span>
                          <span className="tabular shrink-0 text-destructive">
                            {formatCurrency(cause.valor)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <p className="flex items-start gap-1.5 text-xs">
                  {alert.recuperacao ? (
                    <>
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                      <span>
                        Volta ao positivo em{" "}
                        <strong>{formatDate(alert.recuperacao.data)}</strong> com{" "}
                        {alert.recuperacao.evento.descricao}.
                      </span>
                    </>
                  ) : (
                    <>
                      <CalendarDays className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                      <span>Sem previsão de recuperação no horizonte.</span>
                    </>
                  )}
                </p>

                <div className="max-h-40 space-y-1 overflow-y-auto">
                  {alert.eventos.slice(0, 20).map((event) => (
                    <div
                      key={event.id}
                      className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1 text-[11px]"
                    >
                      <span className="min-w-0 truncate">
                        {formatMonthShort(event.data.slice(0, 7))} ·{" "}
                        {event.descricao}
                      </span>
                      <span className="tabular shrink-0">
                        {formatCurrency(event.valor)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function ForecastEmptyState({
  meses,
  menorSaldo,
  menorData,
}: {
  meses: number;
  menorSaldo: number;
  menorData: string;
}) {
  return (
    <div className="rounded-xl border border-success/40 bg-success/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium text-success">
        <CheckCircle2 className="h-4 w-4" />
        Sua previsão está positiva pelos próximos {meses} meses.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Menor saldo: {formatCurrency(menorSaldo)} em {formatDate(menorData)}.
      </p>
    </div>
  );
}

export function AnnualIncomeSuggestion() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-muted/30 p-3 text-xs">
      <p className="text-muted-foreground">
        Cadastre seu 13º/férias como receita anual para melhorar a previsão.
      </p>
      <Button asChild variant="outline" size="sm" className="h-12 sm:h-9">
        <Link href="/lancamentos?novo=1">Cadastrar receita anual</Link>
      </Button>
    </div>
  );
}
