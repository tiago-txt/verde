import { isValidISODate } from "@/lib/dates";

/** Máscara progressiva dd/MM/yyyy para digitação. */
export function maskBRDate(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 8);
  const day = digits.slice(0, 2);
  const month = digits.slice(2, 4);
  const year = digits.slice(4, 8);

  if (digits.length <= 2) return day;
  if (digits.length <= 4) return `${day}/${month}`;
  return `${day}/${month}/${year}`;
}

/**
 * Converte dd/MM/yyyy para ISO (somente data), validando datas reais.
 * Retorna null para entrada incompleta ou inválida.
 */
export function parseBRDate(input: string): string | null {
  const masked = maskBRDate(input);
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(masked)) return null;

  const [day, month, year] = masked.split("/");
  const iso = `${year}-${month}-${day}`;
  return isValidISODate(iso) ? iso : null;
}
