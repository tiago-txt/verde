"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { accounts, creditCards, transactions } from "@/lib/db/schema";
import { getCardInvoiceDetail } from "@/lib/db/queries/cards";
import { countCardTransactions } from "@/lib/db/queries/cards";
import { formatCurrency } from "@/lib/format";
import { idSchema } from "@/lib/validation/common";
import {
  createCardSchema,
  payInvoiceSchema,
  updateCardSchema,
  type CardFormValues,
  type PayInvoiceInput,
} from "@/lib/validation/cards";
import type { ActionResult } from "./result";

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function revalidateCards(cardId?: string) {
  revalidatePath("/cartoes");
  if (cardId) revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/lancamentos");
  revalidatePath("/contas");
  revalidatePath("/");
}

function validatePaymentAccount(accountId: string): string | null {
  const account = getDb()
    .select({ id: accounts.id, arquivada: accounts.arquivada })
    .from(accounts)
    .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)))
    .get();

  if (!account) return "Conta de pagamento não encontrada.";
  if (account.arquivada) return "A conta de pagamento está arquivada.";
  return null;
}

export async function createCardAction(
  input: CardFormValues,
): Promise<ActionResult> {
  await requireUser();

  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  if (data.contaPagamentoId) {
    const error = validatePaymentAccount(data.contaPagamentoId);
    if (error) return fail(error);
  }

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    getDb()
      .insert(creditCards)
      .values({
        id,
        nome: data.nome,
        bandeira: data.bandeira,
        limite: data.limite,
        diaFechamento: data.diaFechamento,
        diaVencimento: data.diaVencimento,
        contaPagamentoId: data.contaPagamentoId,
        cor: data.cor,
        icone: data.icone,
        arquivado: false,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (error) {
    console.error("[verde] erro ao criar cartão:", error);
    return fail(
      error instanceof Error ? error.message : "Não foi possível criar o cartão.",
    );
  }

  revalidateCards(id);
  return { ok: true, id };
}

export async function updateCardAction(
  input: CardFormValues & { id: string },
): Promise<ActionResult> {
  await requireUser();

  const parsed = updateCardSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  if (data.contaPagamentoId) {
    const error = validatePaymentAccount(data.contaPagamentoId);
    if (error) return fail(error);
  }

  const existing = getDb()
    .select({ id: creditCards.id })
    .from(creditCards)
    .where(and(eq(creditCards.id, data.id), isNull(creditCards.deletedAt)))
    .get();
  if (!existing) return fail("Cartão não encontrado.");

  try {
    getDb()
      .update(creditCards)
      .set({
        nome: data.nome,
        bandeira: data.bandeira,
        limite: data.limite,
        diaFechamento: data.diaFechamento,
        diaVencimento: data.diaVencimento,
        contaPagamentoId: data.contaPagamentoId,
        cor: data.cor,
        icone: data.icone,
        updatedAt: new Date(),
      })
      .where(eq(creditCards.id, data.id))
      .run();
  } catch (error) {
    console.error("[verde] erro ao atualizar cartão:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Não foi possível salvar o cartão.",
    );
  }

  revalidateCards(data.id);
  return { ok: true, id: data.id };
}

export async function setCardArchivedAction(input: {
  id: string;
  arquivado: boolean;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z
    .object({ id: idSchema, arquivado: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("Cartão inválido.");

  const result = getDb()
    .update(creditCards)
    .set({ arquivado: parsed.data.arquivado, updatedAt: new Date() })
    .where(eq(creditCards.id, parsed.data.id))
    .run();

  if (result.changes === 0) return fail("Cartão não encontrado.");

  revalidateCards(parsed.data.id);
  return { ok: true, id: parsed.data.id };
}

export async function deleteCardAction(input: {
  id: string;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return fail("Cartão inválido.");

  if (countCardTransactions(parsed.data.id) > 0) {
    return fail(
      "Este cartão tem lançamentos. Arquive-o em vez de excluir para preservar o histórico.",
    );
  }

  // Soft delete: mantém rastros e evita reaproveitar o id.
  const result = getDb()
    .update(creditCards)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(creditCards.id, parsed.data.id))
    .run();

  if (result.changes === 0) return fail("Cartão não encontrado.");

  revalidateCards(parsed.data.id);
  return { ok: true };
}

export async function payInvoiceAction(
  input: PayInvoiceInput,
): Promise<ActionResult> {
  await requireUser();

  const parsed = payInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  const card = getDb()
    .select()
    .from(creditCards)
    .where(and(eq(creditCards.id, data.cartaoId), isNull(creditCards.deletedAt)))
    .get();
  if (!card) return fail("Cartão não encontrado.");
  if (card.arquivado) return fail("Este cartão está arquivado.");

  const accountError = validatePaymentAccount(data.contaId);
  if (accountError) return fail(accountError);

  const detail = getCardInvoiceDetail(data.cartaoId, data.faturaChave);
  if (!detail) return fail("Fatura não encontrada.");

  const id = crypto.randomUUID();
  const now = new Date();
  const descricao = `Pagamento de fatura · ${card.nome}`;

  try {
    getDb()
      .insert(transactions)
      .values({
        id,
        tipo: "transferencia",
        descricao,
        valor: data.valor,
        data: data.data,
        pago: true,
        contaId: data.contaId,
        contaDestinoId: null,
        cartaoDestinoId: card.id,
        faturaChave: data.faturaChave,
        categoriaId: null,
        observacao: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  } catch (error) {
    console.error("[verde] erro ao pagar fatura:", error);
    return fail("Não foi possível registrar o pagamento da fatura.");
  }

  revalidateCards(card.id);
  const excess = data.valor - detail.fatura.restante;
  return {
    ok: true,
    id,
    notice:
      excess > 0
        ? {
            tone: "warning",
            message: `Pagamento acima do restante; ${formatCurrency(excess)} ficará como crédito na fatura.`,
          }
        : {
            tone: "success",
            message: "Pagamento de fatura registrado.",
          },
  };
}
