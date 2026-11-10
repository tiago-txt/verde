import type { Metadata } from "next";
import { Wallet } from "lucide-react";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Contas" };

export default function ContasPage() {
  return (
    <PlaceholderPage
      title="Contas"
      description="Onde o seu dinheiro está agora."
      stage="Etapa 2"
      icon={Wallet}
      items={[
        "Cadastro de contas correntes, poupança, dinheiro e investimentos",
        "Saldo atual calculado a partir do saldo inicial e dos lançamentos pagos",
        "Saldo previsto incluindo lançamentos ainda não pagos",
        "Cores, ícones e arquivamento de contas antigas",
      ]}
    />
  );
}
