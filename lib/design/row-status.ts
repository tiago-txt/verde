export type BudgetProjectionStatus =
  | "prevista"
  | "apurada"
  | "estouro"
  | "consumido"
  | "sobra";

export function budgetProjectionStatus(input: {
  isProvision: boolean;
  estouro: number;
  restante: number;
  status: "prevista" | "apurada" | null;
}): BudgetProjectionStatus {
  if (!input.isProvision) return "sobra";
  if (input.estouro > 0) return "estouro";
  if (input.restante <= 0) return "consumido";
  return input.status === "apurada" ? "apurada" : "prevista";
}

export function invoiceProjectionStatus(input: {
  vencida: boolean;
  status: "aberta" | "fechada" | "parcial" | "paga";
}): "vencida" | "paga" | "parcial" | "aberta" | "fechada" {
  if (input.status === "paga") return "paga";
  if (input.vencida) return "vencida";
  return input.status;
}
