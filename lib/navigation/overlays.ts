import { isValidMonthKey } from "@/lib/dates";
import { budgetEventIdSchema, idSchema } from "@/lib/validation/common";

export type InvoiceOverlayTarget = {
  cartaoId: string;
  faturaChave: string;
};

function firstValue(
  value: string | string[] | undefined,
): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Lê `abrirFatura` + `faturaChave` e só aceita cartão e mês válidos. */
export function parseInvoiceOverlay(
  cartaoId: string | string[] | undefined,
  faturaChave: string | string[] | undefined,
): InvoiceOverlayTarget | null {
  const card = firstValue(cartaoId);
  const month = firstValue(faturaChave);
  if (!card || !month) return null;
  if (!idSchema.safeParse(card).success) return null;
  if (!isValidMonthKey(month)) return null;
  return { cartaoId: card, faturaChave: month };
}

/** Lê `abrirEvento` (evento de orçamento composto) com validação. */
export function parseBudgetEventOverlay(
  value: string | string[] | undefined,
): string | null {
  const raw = firstValue(value);
  if (!raw) return null;
  return budgetEventIdSchema.safeParse(raw).success ? raw : null;
}

/** Acrescenta parâmetros de overlay ao href da tela, preservando os atuais. */
export function withScreenParams(
  href: string,
  params: Record<string, string>,
): string {
  const [path, query = ""] = href.split("?");
  const search = new URLSearchParams(query);
  for (const [key, value] of Object.entries(params)) search.set(key, value);
  return `${path}?${search.toString()}`;
}

function isTransactionsScreen(value: string): boolean {
  return value === "/lancamentos" || value.startsWith("/lancamentos?");
}

/**
 * Abre a edição da compra mantendo mês/filtros da tela de origem quando ela é
 * Lançamentos. Trocar o mês atrás do modal muda a altura da lista e faz o
 * navegador perder a posição da rolagem. Fora de Lançamentos (página do
 * cartão, por exemplo), abre no mês da própria compra.
 */
export function purchaseEditHref(
  returnTo: string,
  purchase: { id: string; mes: string },
): string {
  if (isTransactionsScreen(returnTo)) {
    return withScreenParams(returnTo, {
      editar: purchase.id,
      voltar: returnTo,
    });
  }
  return `/lancamentos?mes=${purchase.mes}&editar=${purchase.id}&dias=31&voltar=${encodeURIComponent(returnTo)}`;
}
