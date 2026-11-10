import type { Metadata } from "next";
import { BarChart3 } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Relatórios" };

export default function RelatoriosPage() {
  return (
    <PlaceholderPage
      title="Relatórios"
      description="Entenda para onde o dinheiro vai."
      stage="Etapa 5"
      icon={BarChart3}
      items={[
        "Gastos por categoria, por mês e por conta/cartão",
        "Filtro de período com comparação entre meses",
        "Gráficos de evolução mensal e distribuição por categoria",
        "Exportação em CSV",
      ]}
    />
  );
}
