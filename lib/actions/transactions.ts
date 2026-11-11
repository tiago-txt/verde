"use server";

import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { addDaysISO } from "@/lib/dates";
import { getDb } from "@/lib/db";
import {
  accounts,
  categories,
  creditCards,
  recurrences,
  tags,
  transactionTags,
  transactions,
  type RecurrenceTemplate,
} from "@/lib/db/schema";
import { getCategoryById } from "@/lib/db/queries/categories";
import { getSystemCategoryIds } from "@/lib/db/queries/categories";
import { getBudgetNoticeForTransactions } from "@/lib/db/queries/budgets";
import { ensureRecurrencesForMonth } from "@/lib/db/queries/transactions";
import { idsForCategoryChange } from "@/lib/finance/batch";
import { resolveCategoryId } from "@/lib/finance/categories";
import { buildInstallmentPlan } from "@/lib/finance/installments";
import {
  selectFixedRecurrenceTransactions,
  selectInstallmentTransactions,
} from "@/lib/finance/scopes";
import { idSchema } from "@/lib/validation/common";
import {
  createTransactionSchema,
  transactionUpdateSchema,
  type TransactionFormValues,
  type UpdateTransactionInput,
} from "@/lib/validation/transactions";
import type { ActionResult } from "./result";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function fail(error: string, code?: string): ActionResult {
  return { ok: false, error, code };
}

function revalidateTransactions() {
  revalidatePath("/");
  revalidatePath("/lancamentos");
  revalidatePath("/contas");
  // Inclui o detalhe de fatura (/cartoes/[id]) e a lista.
  revalidatePath("/cartoes", "layout");
}

function normalizeObservation(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function insertTags(tx: Tx, transactionId: string, tagIds: string[]) {
  if (tagIds.length === 0) return;
  tx.insert(transactionTags)
    .values(tagIds.map((tagId) => ({ transactionId, tagId })))
    .onConflictDoNothing()
    .run();
}

function replaceTags(tx: Tx, transactionId: string, tagIds: string[]) {
  tx.delete(transactionTags)
    .where(eq(transactionTags.transactionId, transactionId))
    .run();
  insertTags(tx, transactionId, tagIds);
}

type AllowedReferences = {
  contaIds?: Set<string>;
  cartaoIds?: Set<string>;
  categoriaId?: string | null;
};

function validateReferences(
  data: Pick<
    TransactionFormValues,
    | "tipo"
    | "contaId"
    | "cartaoId"
    | "contaDestinoId"
    | "categoriaId"
    | "tagIds"
  >,
  allowed?: AllowedReferences,
): string | null {
  const db = getDb();

  if (data.tipo === "transferencia") {
    if (!data.contaId) return "Escolha a conta de origem.";

    const account = db
      .select({ id: accounts.id, arquivada: accounts.arquivada })
      .from(accounts)
      .where(and(eq(accounts.id, data.contaId), isNull(accounts.deletedAt)))
      .get();

    if (!account) return "Conta não encontrada.";
    if (account.arquivada && !allowed?.contaIds?.has(account.id)) {
      return "A conta selecionada está arquivada.";
    }

    if (!data.contaDestinoId) return "Escolha a conta de destino.";
    if (data.contaDestinoId === data.contaId) {
      return "A conta de destino deve ser diferente da origem.";
    }

    const destination = db
      .select({ id: accounts.id, arquivada: accounts.arquivada })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, data.contaDestinoId),
          isNull(accounts.deletedAt),
        ),
      )
      .get();

    if (!destination) return "Conta de destino não encontrada.";
    if (destination.arquivada && !allowed?.contaIds?.has(destination.id)) {
      return "A conta de destino está arquivada.";
    }
  } else if (data.cartaoId) {
    const card = db
      .select({ id: creditCards.id, arquivado: creditCards.arquivado })
      .from(creditCards)
      .where(
        and(
          eq(creditCards.id, data.cartaoId),
          isNull(creditCards.deletedAt),
        ),
      )
      .get();

    if (!card) return "Cartão não encontrado.";
    if (card.arquivado && !allowed?.cartaoIds?.has(card.id)) {
      return "O cartão selecionado está arquivado.";
    }
    if (data.contaId) {
      return "Escolha apenas conta ou cartão.";
    }
  } else if (data.contaId) {
    const account = db
      .select({ id: accounts.id, arquivada: accounts.arquivada })
      .from(accounts)
      .where(and(eq(accounts.id, data.contaId), isNull(accounts.deletedAt)))
      .get();

    if (!account) return "Conta não encontrada.";
    if (account.arquivada && !allowed?.contaIds?.has(account.id)) {
      return "A conta selecionada está arquivada.";
    }
  } else {
    return "Escolha uma conta ou cartão.";
  }

  if (data.tipo !== "transferencia" && data.categoriaId) {
    const category = db
      .select({
        id: categories.id,
        tipo: categories.tipo,
        deletedAt: categories.deletedAt,
      })
      .from(categories)
      .where(eq(categories.id, data.categoriaId))
      .get();

    if (!category) return "Categoria não encontrada.";
    if (category.deletedAt && allowed?.categoriaId !== category.id) {
      return "A categoria selecionada está arquivada.";
    }
    if (category.tipo !== data.tipo) {
      return "A categoria não corresponde ao tipo do lançamento.";
    }
  }

  if (data.tagIds.length > 0) {
    const found = db
      .select({ id: tags.id })
      .from(tags)
      .where(inArray(tags.id, data.tagIds))
      .all();

    if (found.length !== new Set(data.tagIds).size) {
      return "Uma das tags selecionadas não existe mais.";
    }
  }

  return null;
}

export async function createTransactionAction(
  input: TransactionFormValues,
): Promise<ActionResult> {
  await requireUser();

  const parsed = createTransactionSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  const categoriaId = resolveCategoryId(
    { tipo: data.tipo, categoriaId: data.categoriaId },
    getSystemCategoryIds(),
  );
  if (data.tipo !== "transferencia" && !categoriaId) {
    return fail(
      "A categoria padrão Outros não foi encontrada. Rode as migrations/seed novamente.",
    );
  }

  const referenceError = validateReferences({ ...data, categoriaId });
  if (referenceError) return fail(referenceError);

  const id = crypto.randomUUID();
  const observacao = normalizeObservation(data.observacao);
  const isCard = Boolean(data.cartaoId) && data.tipo !== "transferencia";
  const cartaoId = isCard ? data.cartaoId : null;
  const contaId = isCard ? null : data.contaId;
  const pago = isCard ? false : data.pago;
  const contaDestinoId =
    data.tipo === "transferencia" ? data.contaDestinoId : null;

  try {
    getDb().transaction((tx) => {
      if (data.repeticao === "fixa") {
        const recurrenceId = crypto.randomUUID();
        const template: RecurrenceTemplate = {
          tipo: data.tipo,
          descricao: data.descricao,
          valor: data.valor,
          contaId,
          cartaoId,
          contaDestinoId,
          categoriaId,
          observacao,
          tagIds: data.tagIds,
          pago: false,
        };

        tx.insert(recurrences)
          .values({
            id: recurrenceId,
            frequencia: data.frequencia,
            dataInicio: data.data,
            dataFim: data.dataFim,
            ativo: true,
            template,
          })
          .run();

        tx.insert(transactions)
          .values({
            id,
            tipo: data.tipo,
            descricao: data.descricao,
            valor: data.valor,
            data: data.data,
            pago,
            contaId,
            cartaoId,
            contaDestinoId,
            categoriaId,
            observacao,
            recorrenciaId: recurrenceId,
          })
          .run();

        insertTags(tx, id, data.tagIds);
      } else if (data.repeticao === "parcelada") {
        const groupId = crypto.randomUUID();
        const plan = buildInstallmentPlan({
          valorCents: data.valor,
          parcelas: data.parcelas,
          dataInicio: data.data,
          baseValor: data.baseValor,
        });

        for (const item of plan) {
          const installmentId = crypto.randomUUID();
          tx.insert(transactions)
            .values({
              id: installmentId,
              tipo: data.tipo,
              descricao: data.descricao,
              valor: item.valor,
              data: item.data,
              pago: isCard ? false : item.numero === 1 ? pago : false,
              contaId,
              cartaoId,
              contaDestinoId: null,
              categoriaId,
              observacao,
              parcelaGrupoId: groupId,
              parcelaAtual: item.numero,
              parcelaTotal: plan.length,
            })
            .run();

          insertTags(tx, installmentId, data.tagIds);
        }
      } else {
        tx.insert(transactions)
          .values({
            id,
            tipo: data.tipo,
            descricao: data.descricao,
            valor: data.valor,
            data: data.data,
            pago,
            contaId,
            cartaoId,
            contaDestinoId,
            categoriaId,
            observacao,
          })
          .run();

        insertTags(tx, id, data.tagIds);
      }
    });
  } catch (error) {
    console.error("[verde] erro ao criar lançamento:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Não foi possível criar o lançamento.",
    );
  }

  if (data.repeticao === "fixa") {
    try {
      ensureRecurrencesForMonth(data.data.slice(0, 7));
    } catch (error) {
      // A primeira ocorrência já foi criada; a geração é idempotente e será
      // tentada novamente ao abrir a tela de lançamentos.
      console.error("[verde] erro ao gerar recorrências:", error);
    }
  }

  revalidateTransactions();
  return {
    ok: true,
    id,
    budgetNotice:
      data.tipo === "despesa"
        ? (getBudgetNoticeForTransactions([
            { categoriaId, data: data.data, cartaoId: data.cartaoId ?? null },
          ]) ?? undefined)
        : undefined,
  };
}

export async function updateTransactionAction(
  input: UpdateTransactionInput,
): Promise<ActionResult> {
  await requireUser();

  const parsed = transactionUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  const db = getDb();
  const existing = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, data.id), isNull(transactions.deletedAt)))
    .get();

  if (!existing) return fail("Lançamento não encontrado.");

  if (existing.faturaChave) {
    return fail(
      "Pagamentos de fatura não podem ser editados. Desfaça o pagamento e registre novamente.",
    );
  }

  const isFixed = Boolean(existing.recorrenciaId);
  const isInstallment = Boolean(existing.parcelaGrupoId);
  const isGrouped = isFixed || isInstallment;

  if (isGrouped && data.tipo !== existing.tipo) {
    return fail(
      "Não é possível alterar o tipo de um lançamento recorrente ou parcelado.",
    );
  }
  if (isGrouped && data.data !== existing.data) {
    return fail(
      "Não é possível alterar a data de um lançamento recorrente ou parcelado. Exclua e crie um novo.",
    );
  }

  const categoriaId = resolveCategoryId(
    { tipo: data.tipo, categoriaId: data.categoriaId },
    getSystemCategoryIds(),
  );
  if (data.tipo !== "transferencia" && !categoriaId) {
    return fail(
      "A categoria padrão Outros não foi encontrada. Rode as migrations/seed novamente.",
    );
  }

  const referenceError = validateReferences(
    { ...data, categoriaId },
    {
      contaIds: new Set(
        [existing.contaId, existing.contaDestinoId].filter(
          (value): value is string => Boolean(value),
        ),
      ),
      cartaoIds: new Set(
        [existing.cartaoId].filter((value): value is string => Boolean(value)),
      ),
      categoriaId: existing.categoriaId,
    },
  );
  if (referenceError) return fail(referenceError);

  const observacao = normalizeObservation(data.observacao);
  const isCard = Boolean(data.cartaoId) && data.tipo !== "transferencia";
  const cartaoId = isCard ? data.cartaoId : null;
  const contaId = isCard ? null : data.contaId;
  const pago = isCard ? false : data.pago;
  const contaDestinoId =
    data.tipo === "transferencia" ? data.contaDestinoId : null;

  const updateValues = {
    tipo: data.tipo,
    descricao: data.descricao,
    valor: data.valor,
    contaId,
    cartaoId,
    contaDestinoId,
    categoriaId,
    observacao,
    updatedAt: new Date(),
  };
  // Em lançamentos agrupados a data é bloqueada; não a regravamos para não
  // colidir com a unique (recorrencia_id, data) nas outras ocorrências.
  const updateValuesWithDate = {
    ...updateValues,
    data: data.data,
    pago,
  };
  // Ao editar vários lançamentos, preservamos o status de pagamento de cada
  // ocorrência (o usuário pode marcar pago individualmente ou em lote depois).
  const groupedUpdateValues =
    data.scope === "single"
      ? { ...updateValues, pago: isCard ? false : data.pago }
      : updateValues;

  try {
    db.transaction((tx) => {
      if (!isGrouped) {
        tx.update(transactions)
          .set(updateValuesWithDate)
          .where(eq(transactions.id, data.id))
          .run();
        replaceTags(tx, data.id, data.tagIds);
        return;
      }

      if (isFixed) {
        const recurrenceId = existing.recorrenciaId as string;
        let ids: string[] = [data.id];

        if (data.scope !== "single") {
          const rows = tx
            .select({ id: transactions.id, data: transactions.data })
            .from(transactions)
            .where(
              and(
                eq(transactions.recorrenciaId, recurrenceId),
                isNull(transactions.deletedAt),
              ),
            )
            .all();

          ids = selectFixedRecurrenceTransactions(
            rows.map((row) => ({ ...row, parcelaAtual: null })),
            { id: data.id, data: existing.data },
            data.scope,
          ).map((row) => row.id);
        }

        if (ids.length > 0) {
          tx.update(transactions)
            .set(groupedUpdateValues)
            .where(inArray(transactions.id, ids))
            .run();

          for (const transactionId of ids) {
            replaceTags(tx, transactionId, data.tagIds);
          }
        }

        if (data.scope !== "single") {
          const recurrence = tx
            .select()
            .from(recurrences)
            .where(eq(recurrences.id, recurrenceId))
            .get();

          if (recurrence) {
            const template: RecurrenceTemplate = {
              ...recurrence.template,
              tipo: data.tipo,
              descricao: data.descricao,
              valor: data.valor,
              contaId,
              cartaoId,
              contaDestinoId,
              categoriaId,
              observacao,
              tagIds: data.tagIds,
              pago: false,
            };

            tx.update(recurrences)
              .set({ template, updatedAt: new Date() })
              .where(eq(recurrences.id, recurrenceId))
              .run();
          }
        }
      }

      if (isInstallment) {
        const groupId = existing.parcelaGrupoId as string;
        let ids: string[] = [data.id];

        if (data.scope !== "single") {
          const rows = tx
            .select({
              id: transactions.id,
              parcelaAtual: transactions.parcelaAtual,
            })
            .from(transactions)
            .where(
              and(
                eq(transactions.parcelaGrupoId, groupId),
                isNull(transactions.deletedAt),
              ),
            )
            .all();

          ids = selectInstallmentTransactions(
            rows.map((row) => ({
              id: row.id,
              data: existing.data,
              parcelaAtual: row.parcelaAtual,
            })),
            {
              id: data.id,
              parcelaAtual: existing.parcelaAtual ?? 1,
            },
            data.scope,
          ).map((row) => row.id);
        }

        if (ids.length > 0) {
          tx.update(transactions)
            .set(groupedUpdateValues)
            .where(inArray(transactions.id, ids))
            .run();

          for (const transactionId of ids) {
            replaceTags(tx, transactionId, data.tagIds);
          }
        }
      }
    });
  } catch (error) {
    console.error("[verde] erro ao atualizar lançamento:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Não foi possível salvar o lançamento.",
    );
  }

  revalidateTransactions();
  return {
    ok: true,
    id: data.id,
    budgetNotice:
      data.tipo === "despesa"
        ? (getBudgetNoticeForTransactions([
            { categoriaId, data: data.data, cartaoId: data.cartaoId ?? null },
          ]) ?? undefined)
        : undefined,
  };
}

export async function deleteTransactionAction(input: {
  id: string;
  scope?: "single" | "future" | "all";
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z
    .object({
      id: idSchema,
      scope: z.enum(["single", "future", "all"]).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Lançamento inválido.");

  const { id, scope = "single" } = parsed.data;
  const db = getDb();
  const existing = db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), isNull(transactions.deletedAt)))
    .get();

  if (!existing) return fail("Lançamento não encontrado.");

  const now = new Date();

  db.transaction((tx) => {
    if (existing.recorrenciaId) {
      const recurrenceId = existing.recorrenciaId;

      if (scope === "single") {
        tx.update(transactions)
          .set({ deletedAt: now })
          .where(eq(transactions.id, id))
          .run();
        return;
      }

      if (scope === "future") {
        tx.update(transactions)
          .set({ deletedAt: now })
          .where(
            and(
              eq(transactions.recorrenciaId, recurrenceId),
              gte(transactions.data, existing.data),
              isNull(transactions.deletedAt),
            ),
          )
          .run();

        tx.update(recurrences)
          .set({
            ativo: false,
            dataFim: addDaysISO(existing.data, -1),
            updatedAt: now,
          })
          .where(eq(recurrences.id, recurrenceId))
          .run();
        return;
      }

      tx.update(transactions)
        .set({ deletedAt: now })
        .where(
          and(
            eq(transactions.recorrenciaId, recurrenceId),
            isNull(transactions.deletedAt),
          ),
        )
        .run();

      tx.update(recurrences)
        .set({ ativo: false, updatedAt: now })
        .where(eq(recurrences.id, recurrenceId))
        .run();
      return;
    }

    if (existing.parcelaGrupoId) {
      const groupId = existing.parcelaGrupoId;

      if (scope === "single") {
        tx.update(transactions)
          .set({ deletedAt: now })
          .where(eq(transactions.id, id))
          .run();
        return;
      }

      const condition =
        scope === "future"
          ? and(
              eq(transactions.parcelaGrupoId, groupId),
              gte(transactions.parcelaAtual, existing.parcelaAtual ?? 1),
              isNull(transactions.deletedAt),
            )
          : and(
              eq(transactions.parcelaGrupoId, groupId),
              isNull(transactions.deletedAt),
            );

      tx.update(transactions).set({ deletedAt: now }).where(condition).run();
      return;
    }

    tx.update(transactions)
      .set({ deletedAt: now })
      .where(eq(transactions.id, id))
      .run();
  });

  revalidateTransactions();
  return { ok: true };
}

export async function duplicateTransactionAction(
  id: string,
): Promise<ActionResult> {
  await requireUser();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return fail("Lançamento inválido.");

  const db = getDb();
  const existing = db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.id, parsedId.data), isNull(transactions.deletedAt)),
    )
    .get();

  if (!existing) return fail("Lançamento não encontrado.");

  if (existing.faturaChave) {
    return fail("Pagamentos de fatura não podem ser duplicados.");
  }

  const tagRows = db
    .select({ tagId: transactionTags.tagId })
    .from(transactionTags)
    .where(eq(transactionTags.transactionId, parsedId.data))
    .all();

  const duplicatedCategoryId =
    existing.tipo === "transferencia"
      ? null
      : existing.categoriaId ??
        resolveCategoryId(
          { tipo: existing.tipo, categoriaId: null },
          getSystemCategoryIds(),
        );

  const newId = crypto.randomUUID();

  db.transaction((tx) => {
    tx.insert(transactions)
      .values({
        id: newId,
        tipo: existing.tipo,
        descricao: existing.descricao,
        valor: existing.valor,
        data: existing.data,
        pago: false,
        contaId: existing.contaId,
        cartaoId: existing.cartaoId,
        contaDestinoId: existing.contaDestinoId,
        categoriaId: duplicatedCategoryId,
        observacao: existing.observacao,
        recorrenciaId: null,
        parcelaGrupoId: null,
        parcelaAtual: null,
        parcelaTotal: null,
      })
      .run();

    insertTags(
      tx,
      newId,
      tagRows.map((row) => row.tagId),
    );
  });

  revalidateTransactions();
  return {
    ok: true,
    id: newId,
    budgetNotice:
      existing.tipo === "despesa"
        ? (getBudgetNoticeForTransactions([
            {
              categoriaId: duplicatedCategoryId,
              data: existing.data,
              cartaoId: existing.cartaoId ?? null,
            },
          ]) ?? undefined)
        : undefined,
  };
}

export async function setTransactionPaidAction(input: {
  id: string;
  pago: boolean;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z
    .object({ id: idSchema, pago: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("Lançamento inválido.");

  const existing = getDb()
    .select({
      id: transactions.id,
      cartaoId: transactions.cartaoId,
    })
    .from(transactions)
    .where(
      and(
        eq(transactions.id, parsed.data.id),
        isNull(transactions.deletedAt),
      ),
    )
    .get();

  if (!existing) return fail("Lançamento não encontrado.");
  if (existing.cartaoId) {
    return fail(
      "O status de compras no cartão é derivado da fatura e não pode ser alterado manualmente.",
    );
  }

  const result = getDb()
    .update(transactions)
    .set({ pago: parsed.data.pago, updatedAt: new Date() })
    .where(
      and(
        eq(transactions.id, parsed.data.id),
        isNull(transactions.deletedAt),
      ),
    )
    .run();

  if (result.changes === 0) return fail("Lançamento não encontrado.");

  revalidateTransactions();
  return { ok: true, id: parsed.data.id };
}

const batchIdsSchema = z.array(idSchema).min(1).max(500);

export async function bulkSetPaidAction(input: {
  ids: string[];
  pago: boolean;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z
    .object({ ids: batchIdsSchema, pago: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("Seleção inválida.");

  const result = getDb()
    .update(transactions)
    .set({ pago: parsed.data.pago, updatedAt: new Date() })
    .where(
      and(
        inArray(transactions.id, parsed.data.ids),
        isNull(transactions.deletedAt),
        isNull(transactions.cartaoId),
      ),
    )
    .run();

  revalidateTransactions();
  return { ok: true, count: result.changes };
}

export async function bulkChangeCategoryAction(input: {
  ids: string[];
  categoriaId: string;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z
    .object({ ids: batchIdsSchema, categoriaId: idSchema })
    .safeParse(input);
  if (!parsed.success) return fail("Seleção inválida.");

  const category = getCategoryById(parsed.data.categoriaId);
  if (!category) return fail("Categoria não encontrada.");

  const rows = getDb()
    .select({
      id: transactions.id,
      tipo: transactions.tipo,
      pago: transactions.pago,
      categoriaId: transactions.categoriaId,
      cartaoId: transactions.cartaoId,
      data: transactions.data,
    })
    .from(transactions)
    .where(
      and(
        inArray(transactions.id, parsed.data.ids),
        isNull(transactions.deletedAt),
      ),
    )
    .all();

  const { applicable, ignored } = idsForCategoryChange(rows, category.tipo);

  if (applicable.length === 0) {
    return {
      ok: false,
      ignored: ignored.length,
      error:
        "Nenhum lançamento compatível com o tipo da categoria. Transferências e o tipo oposto são ignorados.",
    };
  }

  getDb().transaction((tx) => {
    tx.update(transactions)
      .set({ categoriaId: category.id, updatedAt: new Date() })
      .where(inArray(transactions.id, applicable))
      .run();
  });

  revalidateTransactions();
  revalidatePath("/configuracoes/categorias");
  return {
    ok: true,
    count: applicable.length,
    ignored: ignored.length,
    budgetNotice:
      category.tipo === "despesa"
        ? (getBudgetNoticeForTransactions(
            rows
              .filter((row) => applicable.includes(row.id))
              .map((row) => ({
                categoriaId: category.id,
                data: row.data,
                cartaoId: row.cartaoId,
              })),
          ) ?? undefined)
        : undefined,
  };
}

export async function bulkAddTagAction(input: {
  ids: string[];
  tagId: string;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z
    .object({ ids: batchIdsSchema, tagId: idSchema })
    .safeParse(input);
  if (!parsed.success) return fail("Seleção inválida.");

  const tag = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.id, parsed.data.tagId))
    .get();
  if (!tag) return fail("Tag não encontrada.");

  const existing = getDb()
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        inArray(transactions.id, parsed.data.ids),
        isNull(transactions.deletedAt),
      ),
    )
    .all();

  if (existing.length === 0) return fail("Nenhum lançamento encontrado.");

  getDb().transaction((tx) => {
    tx.insert(transactionTags)
      .values(
        existing.map((row) => ({
          transactionId: row.id,
          tagId: tag.id,
        })),
      )
      .onConflictDoNothing()
      .run();
  });

  revalidateTransactions();
  revalidatePath("/configuracoes/categorias");
  return { ok: true, count: existing.length };
}

export async function bulkDeleteTransactionsAction(input: {
  ids: string[];
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z.object({ ids: batchIdsSchema }).safeParse(input);
  if (!parsed.success) return fail("Seleção inválida.");

  const result = getDb()
    .update(transactions)
    .set({ deletedAt: new Date() })
    .where(
      and(
        inArray(transactions.id, parsed.data.ids),
        isNull(transactions.deletedAt),
      ),
    )
    .run();

  revalidateTransactions();
  revalidatePath("/configuracoes/categorias");
  return { ok: true, count: result.changes };
}
