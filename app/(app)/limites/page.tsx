import type { Metadata } from "next";
import { Target } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Limite de gastos" };

export default function LimitesPage() {
  return (
    <PlaceholderPage
      title="Limite de gastos"
      description="Orçamentos mensais por categoria."
      stage="Etapa 5"
      icon={Target}
      items={[
        "Definição de limite mensal por categoria",
        "Barra de progresso com gasto realizado vs. limite",
        "Alerta visual em 80% e 100% do orçamento",
        "Visão consolidada do mês",
      ]}
    />
  );
}
