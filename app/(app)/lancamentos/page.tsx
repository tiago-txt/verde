import type { Metadata } from "next";
import { ArrowLeftRight } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Lançamentos" };

export default function LancamentosPage() {
  return (
    <PlaceholderPage
      title="Lançamentos"
      description="Seu fluxo de caixa, mês a mês."
      stage="Etapas 2 e 3"
      icon={ArrowLeftRight}
      items={[
        "Navegação por mês com agrupamento por dia e saldo diário",
        "Despesas, receitas e transferências, com recorrência e parcelamento",
        "Filtros por conta, cartão, tipo, categoria, tag e busca por texto",
        "Seleção múltipla e ações em lote (marcar pago, excluir, mudar categoria)",
        "Painel lateral de detalhes no desktop e bottom sheet no celular",
      ]}
    />
  );
}
