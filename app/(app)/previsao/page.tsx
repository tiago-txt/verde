import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ForecastControls } from "@/components/forecast/forecast-controls";
import { ForecastView } from "@/components/forecast/forecast-view";
import { requireUser } from "@/lib/auth/current-user";
import { getForecastData } from "@/lib/db/queries/forecast";

export const metadata: Metadata = { title: "Previsão" };

export default async function ForecastPage() {
  const user = await requireUser();
  const data = getForecastData(user.workspaceId, user.id);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Previsão de saldo"
        description="Projeção determinística dos próximos meses, separando o certo das estimativas."
      />

      <ForecastControls
        prefs={data.prefs}
        contas={data.contasDisponiveis}
      />

      <ForecastView data={data} />
    </div>
  );
}
