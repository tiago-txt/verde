import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BudgetsView } from "@/components/budgets/budgets-view";
import { requireUser } from "@/lib/auth/current-user";
import {
  getBudgetFormData,
  listBudgetCycleDetails,
} from "@/lib/db/queries/budgets";
import { currentMonth, isValidMonthKey } from "@/lib/dates";
import { idSchema } from "@/lib/validation/common";

export const metadata: Metadata = { title: "Orçamentos" };

export default async function LimiteDeGastosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();

  const params = await searchParams;
  const rawCiclo = Array.isArray(params.ciclo) ? params.ciclo[0] : params.ciclo;
  const ciclo = rawCiclo && isValidMonthKey(rawCiclo) ? rawCiclo : currentMonth();
  const incluirArquivados =
    (Array.isArray(params.arquivados) ? params.arquivados[0] : params.arquivados) ===
    "1";
  const rawBudget = Array.isArray(params.orcamento)
    ? params.orcamento[0]
    : params.orcamento;
  const initialBudgetId =
    rawBudget && idSchema.safeParse(rawBudget).success ? rawBudget : null;

  const details = listBudgetCycleDetails(user.workspaceId, ciclo, {
    incluirArquivados,
  });
  if (
    initialBudgetId &&
    !details.some((detail) => detail.resumo.id === initialBudgetId)
  ) {
    notFound();
  }
  const formData = getBudgetFormData(user.workspaceId, ciclo);

  return (
    <BudgetsView
      ciclo={ciclo}
      details={details}
      formData={formData}
      incluirArquivados={incluirArquivados}
      initialBudgetId={initialBudgetId}
    />
  );
}
