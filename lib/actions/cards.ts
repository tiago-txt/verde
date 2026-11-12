"use server";

import { and, eq, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { todayISO } from "@/lib/dates";
import { scopedDb } from "@/lib/db/scoped";
import { accounts, creditCards, transactions } from "@/lib/db/schema";
import { getCardInvoiceDetail } from "@/lib/db/queries/cards";
import { countCardTransactions } from "@/lib/db/queries/cards";
import { listAllAccounts } from "@/lib/db/queries/accounts";
import { invalidateForecastCache } from "@/lib/db/queries/forecast";
import {
  datasDaFatura,
  faturaDaCompra,
  type CardCycleConfig,
} from "@/lib/finance/cards";
import { formatCurrency } from "@/lib/format";
import { idSchema, monthKeySchema } from "@/lib/validation/common";
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

export type CardInvoiceDetailResult =
  | {
      ok: true;
      detail: NonNullable<ReturnType<typeof getCardInvoiceDetail>>;
      accounts: ReturnType<typeof listAllAccounts>;
    }
  | { ok: false; error: string };

export async function getCardInvoiceDetailAction(
  cartaoId: string,
  faturaChave: string,
): Promise<CardInvoiceDetailResult> {
  const user = await requireUser();
  const parsed = z
    .object({ cartaoId: idSchema, faturaChave: monthKeySchema })
    .safeParse({ cartaoId, faturaChave });
  if (!parsed.success) return { ok: false, error: "Fatura inválida." };

  const detail = getCardInvoiceDetail(
    user.workspaceId,
    parsed.data.cartaoId,
    parsed.data.faturaChave,
  );
  if (!detail) return { ok: false, error: "Fatura não encontrada." };

  return {
    ok: true,
    detail,
    accounts: listAllAccounts(user.workspaceId),
  };
}

function revalidateCards(cardId?: string) {
  invalidateForecastCache();
  revalidatePath("/cartoes");
  if (cardId) revalidatePath(`/cartoes/${cardId}`);
  revalidatePath("/lancamentos");
  revalidatePath("/contas");
  revalidatePath("/");
}

function validatePaymentAccount(
  workspaceId: string,
  accountId: string,
): string | null {
  const { db, ws } = scopedDb(workspaceId);
  const account = db
    .select({ id: accounts.id, arquivada: accounts.arquivada })
    .from(accounts)
    .where(
      and(
        eq(accounts.id, accountId),
        ws(accounts.workspaceId),
        isNull(accounts.deletedAt),
      ),
    )
    .get();

  if (!account) return "Conta de pagamento não encontrada.";
  if (account.arquivada) return "A conta de pagamento está arquivada.";
  return null;
}

export async function createCardAction(
  input: CardFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db } = scopedDb(user.workspaceId);

  const parsed = createCardSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  if (data.contaPagamentoId) {
    const error = validatePaymentAccount(user.workspaceId, data.contaPagamentoId);
    if (error) return fail(error);
  }

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    db.insert(creditCards)
      .values({
        id,
        workspaceId: user.workspaceId,
        nome: data.nome,
        bandeira: data.bandeira,
        limite: data.limite,
        diaFechamento: data.diaFechamento,
        diaVencimento: data.diaVencimento,
        fechamentoCompra: data.fechamentoCompra ?? "proxima_fatura",
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
      error instanceof Error && error.message.includes("UNIQUE")
        ? "Já existe um cartão com esse nome."
        : error instanceof Error
          ? error.message
          : "Não foi possível criar o cartão.",
    );
  }

  revalidateCards(id);
  return { ok: true, id };
}

function refreshOpenCardSnapshots(
  workspaceId: string,
  cardId: string,
  oldConfig: CardCycleConfig,
  newConfig: CardCycleConfig,
): void {
  const { db, ws } = scopedDb(workspaceId);
  const hoje = todayISO();
  const rows = db
    .select({
      id: transactions.id,
      data: transactions.data,
      cartaoFechamento: transactions.cartaoFechamento,
      cartaoVencimento: transactions.cartaoVencimento,
      cartaoFechamentoCompra: transactions.cartaoFechamentoCompra,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        eq(transactions.cartaoId, cardId),
        isNull(transactions.deletedAt),
      ),
    )
    .all();

  const updates = new Map<string, CardCycleConfig>();
  for (const row of rows) {
    const snapshot: CardCycleConfig =
      row.cartaoFechamento && row.cartaoVencimento
        ? {
            diaFechamento: row.cartaoFechamento,
            diaVencimento: row.cartaoVencimento,
            fechamentoCompra:
              row.cartaoFechamentoCompra ?? oldConfig.fechamentoCompra,
          }
        : oldConfig;
    const chave = faturaDaCompra(row.data, snapshot);
    const fechamento = datasDaFatura(chave, snapshot).fechamento;

    if (fechamento >= hoje) {
      // Ciclo ainda aberto: passa a usar a nova regra do cartão.
      updates.set(row.id, newConfig);
    } else if (!row.cartaoFechamento || !row.cartaoVencimento) {
      // Ciclo encerrado sem snapshot: congela a regra antiga.
      updates.set(row.id, snapshot);
    }
  }

  if (updates.size === 0) return;
  db.transaction((tx) => {
    for (const [id, config] of updates) {
      tx.update(transactions)
        .set({
          cartaoFechamento: config.diaFechamento,
          cartaoVencimento: config.diaVencimento,
          cartaoFechamentoCompra: config.fechamentoCompra ?? "proxima_fatura",
        })
        .where(
          and(
            eq(transactions.id, id),
            eq(transactions.workspaceId, workspaceId),
          ),
        )
        .run();
    }
  });
}

export async function updateCardAction(
  input: CardFormValues & { id: string },
): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = updateCardSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  if (data.contaPagamentoId) {
    const error = validatePaymentAccount(user.workspaceId, data.contaPagamentoId);
    if (error) return fail(error);
  }

  const existing = db
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, data.id),
        ws(creditCards.workspaceId),
        isNull(creditCards.deletedAt),
      ),
    )
    .get();
  if (!existing) return fail("Cartão não encontrado.");

  try {
    db.update(creditCards)
      .set({
        nome: data.nome,
        bandeira: data.bandeira,
        limite: data.limite,
        diaFechamento: data.diaFechamento,
        diaVencimento: data.diaVencimento,
        fechamentoCompra: data.fechamentoCompra ?? "proxima_fatura",
        contaPagamentoId: data.contaPagamentoId,
        cor: data.cor,
        icone: data.icone,
        updatedAt: new Date(),
      })
      .where(
        and(eq(creditCards.id, data.id), ws(creditCards.workspaceId)),
      )
      .run();
  } catch (error) {
    console.error("[verde] erro ao atualizar cartão:", error);
    return fail(
      error instanceof Error && error.message.includes("UNIQUE")
        ? "Já existe um cartão com esse nome."
        : error instanceof Error
          ? error.message
          : "Não foi possível salvar o cartão.",
    );
  }

  const newClosing = data.fechamentoCompra ?? "proxima_fatura";
  if (
    existing.diaFechamento !== data.diaFechamento ||
    existing.diaVencimento !== data.diaVencimento ||
    existing.fechamentoCompra !== newClosing
  ) {
    refreshOpenCardSnapshots(
      user.workspaceId,
      data.id,
      {
        diaFechamento: existing.diaFechamento,
        diaVencimento: existing.diaVencimento,
        fechamentoCompra: existing.fechamentoCompra,
      },
      {
        diaFechamento: data.diaFechamento,
        diaVencimento: data.diaVencimento,
        fechamentoCompra: newClosing,
      },
    );
  }

  revalidateCards(data.id);
  return { ok: true, id: data.id };
}

export async function setCardArchivedAction(input: {
  id: string;
  arquivado: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = z
    .object({ id: idSchema, arquivado: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("Cartão inválido.");

  const result = db
    .update(creditCards)
    .set({ arquivado: parsed.data.arquivado, updatedAt: new Date() })
    .where(
      and(
        eq(creditCards.id, parsed.data.id),
        ws(creditCards.workspaceId),
      ),
    )
    .run();

  if (result.changes === 0) return fail("Cartão não encontrado.");

  revalidateCards(parsed.data.id);
  return { ok: true, id: parsed.data.id };
}

export async function deleteCardAction(input: {
  id: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return fail("Cartão inválido.");

  if (countCardTransactions(user.workspaceId, parsed.data.id) > 0) {
    return fail(
      "Este cartão tem lançamentos. Arquive-o em vez de excluir para preservar o histórico.",
    );
  }

  // Soft delete: mantém rastros e evita reaproveitar o id.
  const result = db
    .update(creditCards)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(creditCards.id, parsed.data.id),
        ws(creditCards.workspaceId),
      ),
    )
    .run();

  if (result.changes === 0) return fail("Cartão não encontrado.");

  revalidateCards(parsed.data.id);
  return { ok: true };
}

export async function payInvoiceAction(
  input: PayInvoiceInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = payInvoiceSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  const card = db
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, data.cartaoId),
        ws(creditCards.workspaceId),
        isNull(creditCards.deletedAt),
      ),
    )
    .get();
  if (!card) return fail("Cartão não encontrado.");
  if (card.arquivado) return fail("Este cartão está arquivado.");

  const accountError = validatePaymentAccount(user.workspaceId, data.contaId);
  if (accountError) return fail(accountError);

  const detail = getCardInvoiceDetail(
    user.workspaceId,
    data.cartaoId,
    data.faturaChave,
  );
  if (!detail) return fail("Fatura não encontrada.");

  const id = crypto.randomUUID();
  const now = new Date();
  const descricao = `Pagamento de fatura · ${card.nome}`;

  try {
    db.insert(transactions)
      .values({
        id,
        workspaceId: user.workspaceId,
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
