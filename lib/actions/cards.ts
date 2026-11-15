"use server";

import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { todayISO } from "@/lib/dates";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  creditCards,
  transactions,
  type CreditCard,
} from "@/lib/db/schema";
import { getCardInvoiceDetail } from "@/lib/db/queries/cards";
import { countCardTransactions } from "@/lib/db/queries/cards";
import { listAllAccounts } from "@/lib/db/queries/accounts";
import { invalidateForecastCache } from "@/lib/db/queries/forecast";
import {
  chaveDaFatura,
  datasDaFatura,
  type CardCycleConfig,
} from "@/lib/finance/cards";
import { formatCurrency } from "@/lib/format";
import { idSchema, isoDateSchema, monthKeySchema } from "@/lib/validation/common";
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
  revalidatePath("/cartoes", "layout");
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
      faturaChaveOverride: transactions.faturaChaveOverride,
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
    const chave = chaveDaFatura(row, snapshot);
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

export async function mergeCardsAction(input: {
  sourceId: string;
  targetId: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = z
    .object({ sourceId: idSchema, targetId: idSchema })
    .refine((value) => value.sourceId !== value.targetId, {
      message: "Escolha um cartão de destino diferente.",
      path: ["targetId"],
    })
    .safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Cartões inválidos.");
  }

  const source = db
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, parsed.data.sourceId),
        ws(creditCards.workspaceId),
        isNull(creditCards.deletedAt),
      ),
    )
    .get();
  if (!source) return fail("Cartão de origem não encontrado.");

  const target = db
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, parsed.data.targetId),
        ws(creditCards.workspaceId),
        isNull(creditCards.deletedAt),
      ),
    )
    .get();
  if (!target) return fail("Cartão de destino não encontrado.");

  const now = new Date();
  let moved = 0;
  db.transaction((tx) => {
    const purchases = tx
      .update(transactions)
      .set({ cartaoId: target.id, updatedAt: now })
      .where(
        and(
          ws(transactions.workspaceId),
          eq(transactions.cartaoId, source.id),
        ),
      )
      .run();
    const payments = tx
      .update(transactions)
      .set({ cartaoDestinoId: target.id, updatedAt: now })
      .where(
        and(
          ws(transactions.workspaceId),
          eq(transactions.cartaoDestinoId, source.id),
        ),
      )
      .run();
    moved = purchases.changes + payments.changes;

    if (!target.contaPagamentoId && source.contaPagamentoId) {
      tx.update(creditCards)
        .set({ contaPagamentoId: source.contaPagamentoId, updatedAt: now })
        .where(
          and(
            eq(creditCards.id, target.id),
            ws(creditCards.workspaceId),
          ),
        )
        .run();
    }

    const aliasKeys = new Set<string>();
    const aliases: string[] = [];
    for (const name of [
      ...(target.apelidos ?? []),
      source.nome,
      ...(source.apelidos ?? []),
    ]) {
      const key = name.trim().toLowerCase();
      if (!key || key === target.nome.trim().toLowerCase() || aliasKeys.has(key)) {
        continue;
      }
      aliasKeys.add(key);
      aliases.push(name.trim());
    }
    tx.update(creditCards)
      .set({ apelidos: aliases, updatedAt: now })
      .where(
        and(eq(creditCards.id, target.id), ws(creditCards.workspaceId)),
      )
      .run();

    tx.update(creditCards)
      .set({ arquivado: true, deletedAt: now, updatedAt: now })
      .where(
        and(
          eq(creditCards.id, source.id),
          ws(creditCards.workspaceId),
        ),
      )
      .run();
  });

  revalidateCards(target.id);
  revalidateCards(source.id);
  return { ok: true, id: target.id, count: moved };
}

export type CardSplitPreview = {
  sourceName: string;
  cutoffInvoice: string;
  purchases: number;
  payments: number;
  purchasesTotal: number;
  paymentsTotal: number;
  oldInvoices: { from: string | null; to: string | null };
  newInvoices: { from: string | null; to: string | null };
  warnings: string[];
};

type SplitCandidates = {
  preview: CardSplitPreview;
  purchaseIds: string[];
  paymentIds: string[];
};

function getSplitCandidates(
  db: ReturnType<typeof scopedDb>["db"],
  workspaceId: string,
  source: CreditCard,
  cutoffInvoice: string,
): SplitCandidates {
  const rows = db
    .select({
      id: transactions.id,
      descricao: transactions.descricao,
      valor: transactions.valor,
      data: transactions.data,
      cartaoId: transactions.cartaoId,
      cartaoDestinoId: transactions.cartaoDestinoId,
      faturaChave: transactions.faturaChave,
      faturaChaveOverride: transactions.faturaChaveOverride,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        isNull(transactions.deletedAt),
        or(
          eq(transactions.cartaoId, source.id),
          eq(transactions.cartaoDestinoId, source.id),
        ),
      ),
    )
    .all();

  const config: CardCycleConfig = {
    diaFechamento: source.diaFechamento,
    diaVencimento: source.diaVencimento,
    fechamentoCompra: source.fechamentoCompra,
    faturasPagasAte: source.faturasPagasAte,
  };

  const purchaseIds: string[] = [];
  const paymentIds: string[] = [];
  const oldInvoices = new Set<string>();
  const newInvoices = new Set<string>();
  const warnings: string[] = [];
  let purchasesTotal = 0;
  let paymentsTotal = 0;

  for (const row of rows) {
    const isPurchase = row.cartaoId === source.id;
    const invoice = isPurchase
      ? chaveDaFatura(
          {
            data: row.data,
            faturaChaveOverride: row.faturaChaveOverride,
          },
          config,
        )
      : row.faturaChave;

    if (!invoice) {
      warnings.push(
        `“${row.descricao}” não tem fatura identificável e ficará no cartão de origem.`,
      );
      continue;
    }

    if (invoice <= cutoffInvoice) {
      oldInvoices.add(invoice);
      if (isPurchase) {
        purchaseIds.push(row.id);
        purchasesTotal += row.valor;
      } else {
        paymentIds.push(row.id);
        paymentsTotal += row.valor;
      }
    } else {
      newInvoices.add(invoice);
    }
  }

  const range = (keys: Set<string>) => {
    const sorted = [...keys].sort();
    return {
      from: sorted[0] ?? null,
      to: sorted.at(-1) ?? null,
    };
  };

  return {
    preview: {
      sourceName: source.nome,
      cutoffInvoice,
      purchases: purchaseIds.length,
      payments: paymentIds.length,
      purchasesTotal,
      paymentsTotal,
      oldInvoices: range(oldInvoices),
      newInvoices: range(newInvoices),
      warnings,
    },
    purchaseIds,
    paymentIds,
  };
}

const cardSplitPreviewSchema = z.object({
  sourceId: idSchema,
  cutoffInvoice: monthKeySchema,
});

export async function previewCardSplitAction(input: {
  sourceId: string;
  cutoffInvoice: string;
}): Promise<
  { ok: true; preview: CardSplitPreview } | { ok: false; error: string }
> {
  const user = await requireUser();
  const parsed = cardSplitPreviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const { db, ws } = scopedDb(user.workspaceId);
  const source = db
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, parsed.data.sourceId),
        ws(creditCards.workspaceId),
        isNull(creditCards.deletedAt),
      ),
    )
    .get();
  if (!source) return { ok: false, error: "Cartão de origem não encontrado." };

  const candidates = getSplitCandidates(
    db,
    user.workspaceId,
    source,
    parsed.data.cutoffInvoice,
  );
  return { ok: true, preview: candidates.preview };
}

const cardSplitActionSchema = z.object({
  sourceId: idSchema,
  cutoffInvoice: monthKeySchema,
  targetId: idSchema.nullable().optional(),
  newCardName: z.string().trim().min(1).max(120).nullable().optional(),
  keepTargetArchived: z.boolean().optional(),
  copyCycleFromSource: z.boolean().optional(),
});

export async function splitCardHistoryAction(input: {
  sourceId: string;
  cutoffInvoice: string;
  targetId?: string | null;
  newCardName?: string | null;
  keepTargetArchived?: boolean;
  copyCycleFromSource?: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = cardSplitActionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const { db, ws } = scopedDb(user.workspaceId);
  const source = db
    .select()
    .from(creditCards)
    .where(
      and(
        eq(creditCards.id, parsed.data.sourceId),
        ws(creditCards.workspaceId),
        isNull(creditCards.deletedAt),
      ),
    )
    .get();
  if (!source) return fail("Cartão de origem não encontrado.");

  const target = parsed.data.targetId
    ? db
        .select()
        .from(creditCards)
        .where(
          and(
            eq(creditCards.id, parsed.data.targetId),
            ws(creditCards.workspaceId),
            isNull(creditCards.deletedAt),
          ),
        )
        .get()
    : null;

  if (parsed.data.targetId && !target) {
    return fail("Cartão de destino não encontrado.");
  }
  if (target?.id === source.id) {
    return fail("Escolha um cartão de destino diferente.");
  }
  if (!target && !parsed.data.newCardName) {
    return fail("Escolha um cartão de destino ou informe o nome do novo.");
  }

  const candidates = getSplitCandidates(
    db,
    user.workspaceId,
    source,
    parsed.data.cutoffInvoice,
  );

  const now = new Date();
  let targetId = target?.id ?? crypto.randomUUID();
  const moved = candidates.purchaseIds.length + candidates.paymentIds.length;

  try {
    db.transaction((tx) => {
      if (!target) {
        tx.insert(creditCards)
          .values({
            id: targetId,
            workspaceId: user.workspaceId,
            nome: parsed.data.newCardName as string,
            bandeira: source.bandeira,
            limite: 0,
            diaFechamento: source.diaFechamento,
            diaVencimento: source.diaVencimento,
            fechamentoCompra: source.fechamentoCompra,
            contaPagamentoId: source.contaPagamentoId,
            cor: source.cor,
            icone: source.icone,
            arquivado: parsed.data.keepTargetArchived ?? true,
            faturasPagasAte: source.faturasPagasAte,
            apelidos: [],
            createdAt: now,
            updatedAt: now,
          })
          .run();
      } else {
        tx.update(creditCards)
          .set({
            arquivado: parsed.data.keepTargetArchived ?? true,
            ...(parsed.data.copyCycleFromSource === false
              ? {}
              : {
                  diaFechamento: source.diaFechamento,
                  diaVencimento: source.diaVencimento,
                  fechamentoCompra: source.fechamentoCompra,
                }),
            contaPagamentoId:
              target.contaPagamentoId ?? source.contaPagamentoId,
            faturasPagasAte:
              target.faturasPagasAte ?? source.faturasPagasAte,
            updatedAt: now,
          })
          .where(
            and(
              eq(creditCards.id, targetId),
              ws(creditCards.workspaceId),
            ),
          )
          .run();
      }

      if (candidates.purchaseIds.length > 0) {
        tx.update(transactions)
          .set({ cartaoId: targetId, updatedAt: now })
          .where(
            and(
              ws(transactions.workspaceId),
              inArray(transactions.id, candidates.purchaseIds),
            ),
          )
          .run();
      }
      if (candidates.paymentIds.length > 0) {
        tx.update(transactions)
          .set({ cartaoDestinoId: targetId, updatedAt: now })
          .where(
            and(
              ws(transactions.workspaceId),
              inArray(transactions.id, candidates.paymentIds),
            ),
          )
          .run();
      }
    });
  } catch (error) {
    console.error("[verde] erro ao separar histórico do cartão:", error);
    return fail(
      error instanceof Error
        ? `Não foi possível separar o histórico: ${error.message}`
        : "Não foi possível separar o histórico.",
    );
  }

  revalidateCards(source.id);
  revalidateCards(targetId);
  return { ok: true, id: targetId, count: moved };
}

export async function markHistoricalInvoicesPaidAction(input: {
  cardId?: string | null;
  until?: string | null;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = z
    .object({
      cardId: idSchema.nullable().optional(),
      until: isoDateSchema.nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Data inválida.");
  }

  const until =
    parsed.data.until === undefined ? todayISO() : parsed.data.until;
  const where = parsed.data.cardId
    ? and(
        ws(creditCards.workspaceId),
        eq(creditCards.id, parsed.data.cardId),
        isNull(creditCards.deletedAt),
      )
    : and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt));

  const result = db
    .update(creditCards)
    .set({ faturasPagasAte: until, updatedAt: new Date() })
    .where(where)
    .run();

  if (result.changes === 0) return fail("Nenhum cartão encontrado.");

  revalidateCards(parsed.data.cardId ?? undefined);
  return { ok: true, count: result.changes };
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
