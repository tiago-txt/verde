import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Cartões" };

export default function CartoesPage() {
  return (
    <PlaceholderPage
      title="Cartões"
      description="Faturas, limites e vencimentos."
      stage="Etapa 4"
      icon={CreditCard}
      items={[
        "Cadastro de cartões com bandeira, limite, fechamento e vencimento",
        "Fatura por mês considerando o período de fechamento",
        "Limite usado e disponível",
        "Ação \"Pagar fatura\", gerando a transferência da conta para o cartão",
      ]}
    />
  );
}
