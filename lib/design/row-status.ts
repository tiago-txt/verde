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

export type TransactionRowStatus = "pago" | "pendente" | "atrasado";

/** Status exibido na linha real da lista (datas ISO comparáveis como texto). */
export function transactionRowStatus(input: {
  pago: boolean;
  data: string;
  today: string;
}): TransactionRowStatus {
  if (input.pago) return "pago";
  return input.data < input.today ? "atrasado" : "pendente";
}
