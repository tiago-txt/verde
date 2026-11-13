"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const ForecastChart = dynamic(
  () => import("./forecast-chart").then((module) => module.ForecastChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[420px] animate-pulse rounded-xl bg-muted/30" />
    ),
  },
);
import {
  AnnualIncomeSuggestion,
  ForecastAlerts,
  ForecastEmptyState,
} from "./forecast-alerts";
import { ForecastMonthlyTable } from "./forecast-monthly-table";
import { NativeSelect } from "@/components/ui/native-select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { ForecastAlert, ForecastData } from "@/lib/db/queries/forecast";

export function ForecastView({ data }: { data: ForecastData }) {
  const [focus, setFocus] = useState<ForecastAlert | null>(
    data.alertas[0] ?? null,
  );
  const [view, setView] = useState<"total" | "conta">("total");
  const [accountId, setAccountId] = useState(data.contas[0]?.id ?? "");
  const certoNegativo = data.projectionCerto.pontos.some(
    (point) => point.saldo < data.prefs.margem,
  );
  const comNegativo = data.projection.pontos.some(
    (point) => point.saldo < data.prefs.margem,
  );

  useEffect(() => {
    if (!data.contas.some((conta) => conta.id === accountId)) {
      setAccountId(data.contas[0]?.id ?? "");
    }
  }, [accountId, data.contas]);

  useEffect(() => {
    if (focus && !data.alertas.some((alert) => alert.inicio === focus.inicio)) {
      setFocus(data.alertas[0] ?? null);
    }
  }, [data.alertas, focus]);

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-3 sm:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <Tabs
            value={view}
            onValueChange={(value) => setView(value as "total" | "conta")}
            className="w-full sm:w-auto"
          >
            <TabsList className="h-12 sm:h-11">
              <TabsTrigger value="total">Total</TabsTrigger>
              <TabsTrigger value="conta">Por conta</TabsTrigger>
            </TabsList>
          </Tabs>
          {view === "conta" && (
            <NativeSelect
              value={accountId}
              onChange={(event) => setAccountId(event.target.value)}
              aria-label="Conta da previsão"
              className="h-12 w-full sm:h-11 sm:w-56"
            >
              {data.contas.map((conta) => (
                <option key={conta.id} value={conta.id}>
                  {conta.nome}
                </option>
              ))}
            </NativeSelect>
          )}
        </div>
        <ForecastChart
          projection={data.projection}
          projectionCerto={data.projectionCerto}
          incluirEstimativas={data.prefs.incluirEstimativas}
          focus={view === "total" ? focus : null}
          accountId={view === "conta" ? accountId : null}
        />
        {data.prefs.incluirEstimativas && certoNegativo !== comNegativo && (
          <p className="mt-2 rounded-md border border-warning/40 bg-warning/5 px-2 py-1.5 text-xs text-muted-foreground">
            Com estimativas: {comNegativo ? "negativo" : "positivo"}; só com o
            certo: {certoNegativo ? "negativo" : "positivo"}.
          </p>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          Linha cheia: somente eventos certos. Linha tracejada: com estimativas.
          Área vermelha: abaixo da margem de segurança.
        </p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Alertas</h2>
          {data.alertas.length > 0 ? (
            <ForecastAlerts alertas={data.alertas} onSelect={setFocus} />
          ) : (
            <ForecastEmptyState
              meses={data.prefs.horizonte}
              menorSaldo={data.menorSaldo.saldo}
              menorData={data.menorSaldo.data}
            />
          )}
          {data.alertas.length > 0 && !data.temReceitaAnual && (
            <AnnualIncomeSuggestion />
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Resumo mensal</h2>
          <ForecastMonthlyTable months={data.meses} />
        </section>
      </div>
    </div>
  );
}
