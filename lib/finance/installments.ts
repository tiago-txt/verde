import { addMonthsClamped } from "./date-math";

export type InstallmentBase = "total" | "parcela";

export type InstallmentPlanItem = {
  numero: number;
  valor: number;
  data: string;
};

/**
 * Divide um total em parcelas inteiras (centavos).
 * O resto vai todo para a primeira parcela: 100,00 em 3x = 33,34 + 33,33 + 33,33.
 */
export function splitInstallments(totalCents: number, count: number): number[] {
  assertInstallmentCount(count);

  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error("O valor deve ser maior que zero.");
  }
  if (totalCents < count) {
    throw new Error(
      "O valor total precisa ser de pelo menos 1 centavo por parcela.",
    );
  }

  const base = Math.floor(totalCents / count);
  const remainder = totalCents % count;

  return Array.from({ length: count }, (_, index) =>
    index === 0 ? base + remainder : base,
  );
}

export function assertInstallmentCount(count: number): void {
  if (!Number.isInteger(count) || count < 2 || count > 60) {
    throw new Error("O número de parcelas deve estar entre 2 e 60.");
  }
}

/**
 * Monta o plano completo de parcelas.
 * - baseValor "total": `valorCents` é o total e será dividido.
 * - baseValor "parcela": `valorCents` é o valor de cada parcela.
 */
export function buildInstallmentPlan(input: {
  valorCents: number;
  parcelas: number;
  dataInicio: string;
  baseValor: InstallmentBase;
}): InstallmentPlanItem[] {
  assertInstallmentCount(input.parcelas);

  if (!Number.isInteger(input.valorCents) || input.valorCents <= 0) {
    throw new Error("O valor deve ser maior que zero.");
  }

  const values =
    input.baseValor === "total"
      ? splitInstallments(input.valorCents, input.parcelas)
      : Array.from({ length: input.parcelas }, () => input.valorCents);

  return values.map((valor, index) => ({
    numero: index + 1,
    valor,
    data: addMonthsClamped(input.dataInicio, index),
  }));
}

export function installmentTotal(plan: InstallmentPlanItem[]): number {
  return plan.reduce((sum, item) => sum + item.valor, 0);
}
