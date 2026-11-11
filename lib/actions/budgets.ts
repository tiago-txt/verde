"use server";

import { and, eq, gte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { addMonths, todayISO } from "@/lib/dates";
import { getDb } from "@/lib/db";
import {
  budgetCategories,
  budgetOverrides,
  budgets,
  categories,
} from "@/lib/db/schema";
import {
  getBudgetCycleDetail,
  getDefaultBudgetAccountId,
  listBudgetsWithCategories,
  type BudgetWithCategories,
} from "@/lib/db/queries/budgets";
import {
  cicloDaData,
  encontrarConflitoDeCategorias,
  expandirCategorias,
  orcamentoVigenteNoCiclo,
  type BudgetCategoryUsage,
} from "@/lib/finance/budgets";
import { getTransactionRaw } from "@/lib/db/queries/transactions";
import { idSchema, isoDateSchema } from "@/lib/validation/common";
import {
  budgetOverrideSchema,
  createBudgetSchema,
  updateBudgetSchema,
  type BudgetFormValues,
  type UpdateBudgetInput,
} from "@/lib/validation/budgets";
import type { ActionResult } from "./result";

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function revalidateBudgets() {
  revalidatePath("/limite-de-gastos");
  revalidatePath("/lancamentos");
  revalidatePath("/");
  revalidatePath("/contas");
}

function validateCategories(categoriaIds: string[]): {
  error?: string;
  names?: Map<string, string>;
} {
  const rows = getDb()
    .select({
      id: categories.id,
      nome: categories.nome,
      tipo: categories.tipo,
      deletedAt: categories.deletedAt,
    })
    .from(categories)
    .all();

  const byId = new Map(rows.map((row) => [row.id, row]));

  for (const id of categoriaIds) {
    const category = byId.get(id);
    if (!category) return { error: "Categoria não encontrada." };
    if (category.deletedAt) {
      return { error: `A categoria "${category.nome}" está arquivada.` };
    }
    if (category.tipo !== "despesa") {
      return { error: "Orçamentos usam apenas categorias de despesa." };
    }
  }

  return { names: new Map(rows.map((row) => [row.id, row.nome])) };
}

function usagesForPeriod(options: {
  start: string;
  end: string | null;
  ignoreBudgetId?: string;
}): BudgetCategoryUsage[] {
  return listBudgetsWithCategories()
    .filter((budget) => {
      if (budget.arquivado) return false;
      if (options.ignoreBudgetId && budget.id === options.ignoreBudgetId) {
        return false;
      }
      if (budget.dataInicio > (options.end ?? "9999-12")) return false;
      if (budget.dataFim && budget.dataFim < options.start) return false;
      return true;
    })
    .map((budget) => ({
      budgetId: budget.id,
      budgetNome: budget.nome,
      categoriaIds: budget.categories.map((category) => category.id),
    }));
}

function conflictError(
  categoriaIds: string[],
  options: {
    start: string;
    end: string | null;
    ignoreBudgetId?: string;
    names?: Map<string, string>;
  },
): string | null {
  const categoryRows = getDb()
    .select({ id: categories.id, categoriaPaiId: categories.categoriaPaiId })
    .from(categories)
    .all();

  const conflict = encontrarConflitoDeCategorias(
    categoryRows,
    categoriaIds,
    usagesForPeriod(options),
    options.ignoreBudgetId,
  );

  if (!conflict) return null;
  const name = options.names?.get(conflict.categoryId) ?? "uma categoria";
  return `A categoria "${name}" já está no orçamento "${conflict.budgetNome}".`;
}

function replaceCategories(tx: Tx, budgetId: string, ids: string[]) {
  tx.delete(budgetCategories)
    .where(eq(budgetCategories.budgetId, budgetId))
    .run();
  tx.insert(budgetCategories)
    .values(ids.map((categoryId) => ({ budgetId, categoryId })))
    .onConflictDoNothing()
    .run();
}

function detectRelevantChange(
  existing: BudgetWithCategories,
  data: UpdateBudgetInput,
): boolean {
  if (existing.valorPadrao !== data.valorPadrao) return true;
  if (existing.diaFechamento !== data.diaFechamento) return true;
  if (existing.dataInicio !== data.dataInicio) return true;
  if ((existing.dataFim ?? null) !== (data.dataFim ?? null)) return true;

  const before = existing.categories.map((category) => category.id).sort();
  const after = [...data.categoriaIds].sort();
  return (
    before.length !== after.length ||
    before.some((id, index) => id !== after[index])
  );
}

function insertNewVersion(
  tx: Tx,
  source: BudgetWithCategories,
  data: BudgetFormValues,
  start: string,
): string {
  const newId = crypto.randomUUID();
  const now = new Date();

  tx.insert(budgets)
    .values({
      id: newId,
      nome: data.nome,
      valorPadrao: data.valorPadrao,
      diaFechamento: data.diaFechamento,
      antecedenciaCiclos: data.antecedenciaCiclos,
      contaId: data.contaId ?? source.contaId,
      dataInicio: start,
      dataFim: data.dataFim,
      cor: data.cor,
      icone: data.icone,
      arquivado: false,
      createdAt: now,
      updatedAt: now,
      categoriaId: data.categoriaIds[0] as string,
      mes: start,
      valorLimite: data.valorPadrao,
    })
    .run();

  replaceCategories(tx, newId, data.categoriaIds);

  // Preserva overrides futuros ao dividir a vigência.
  tx.update(budgetOverrides)
    .set({ budgetId: newId, updatedAt: now })
    .where(
      and(
        eq(budgetOverrides.budgetId, source.id),
        gte(budgetOverrides.ciclo, start),
      ),
    )
    .run();

  return newId;
}

export async function createBudgetAction(
  input: BudgetFormValues,
): Promise<ActionResult> {
  await requireUser();

  const parsed = createBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  const categoryCheck = validateCategories(data.categoriaIds);
  if (categoryCheck.error) return fail(categoryCheck.error);

  const conflict = conflictError(data.categoriaIds, {
    start: data.dataInicio,
    end: data.dataFim,
    names: categoryCheck.names,
  });
  if (conflict) return fail(conflict);

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    getDb().transaction((tx) => {
      tx.insert(budgets)
        .values({
          id,
          nome: data.nome,
          valorPadrao: data.valorPadrao,
          diaFechamento: data.diaFechamento,
          antecedenciaCiclos: data.antecedenciaCiclos,
          // Conta de reserva padrão: a mais usada/principal.
          contaId: data.contaId ?? getDefaultBudgetAccountId(),
          dataInicio: data.dataInicio,
          dataFim: data.dataFim,
          cor: data.cor,
          icone: data.icone,
          arquivado: false,
          createdAt: now,
          updatedAt: now,
          // Colunas legadas da Etapa 1 (mantidas para compatibilidade).
          categoriaId: data.categoriaIds[0] as string,
          mes: data.dataInicio,
          valorLimite: data.valorPadrao,
        })
        .run();

      replaceCategories(tx, id, data.categoriaIds);
    });
  } catch (error) {
    console.error("[verde] erro ao criar orçamento:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Não foi possível criar o orçamento.",
    );
  }

  revalidateBudgets();
  return { ok: true, id };
}

export async function updateBudgetAction(
  input: UpdateBudgetInput,
): Promise<ActionResult> {
  await requireUser();

  const parsed = updateBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  const categoryCheck = validateCategories(data.categoriaIds);
  if (categoryCheck.error) return fail(categoryCheck.error);

  const existing = listBudgetsWithCategories({ incluirArquivados: true }).find(
    (budget) => budget.id === data.id,
  );
  if (!existing) return fail("Orçamento não encontrado.");

  const ciclo = data.ciclo;
  if (
    ciclo < existing.dataInicio ||
    (existing.dataFim && ciclo > existing.dataFim)
  ) {
    return fail("O ciclo escolhido está fora da vigência deste orçamento.");
  }

  // "Só este ciclo" só altera o valor; o restante continua como está.
  if (data.scope === "single") {
    const onlyValueChanged =
      existing.diaFechamento === data.diaFechamento &&
      existing.dataInicio === data.dataInicio &&
      (existing.dataFim ?? null) === (data.dataFim ?? null) &&
      existing.categories.length === data.categoriaIds.length &&
      existing.categories.every((category) =>
        data.categoriaIds.includes(category.id),
      );

    if (!onlyValueChanged) {
      return fail(
        "Em “Só este ciclo” apenas o valor pode mudar. Escolha outro escopo para alterar categorias ou fechamento.",
      );
    }

    try {
      getDb()
        .insert(budgetOverrides)
        .values({
          budgetId: existing.id,
          ciclo,
          valorCentavos: data.valorPadrao,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [budgetOverrides.budgetId, budgetOverrides.ciclo],
          set: { valorCentavos: data.valorPadrao, updatedAt: new Date() },
        })
        .run();
    } catch (error) {
      console.error("[verde] erro ao ajustar ciclo do orçamento:", error);
      return fail("Não foi possível ajustar o valor deste ciclo.");
    }

    revalidateBudgets();
    return { ok: true, id: existing.id };
  }

  let start = data.scope === "future" ? ciclo : data.dataInicio;

  // Alterar o fechamento não pode reescrever ciclos já encerrados.
  if (data.scope === "all" && existing.diaFechamento !== data.diaFechamento) {
    const openCycle = cicloDaData(todayISO(), existing.diaFechamento);
    start = ciclo > openCycle ? ciclo : openCycle;
    if (existing.dataInicio >= start) start = existing.dataInicio;
  }

  if (start < existing.dataInicio) start = existing.dataInicio;

  const conflict = conflictError(data.categoriaIds, {
    start,
    end: data.dataFim,
    ignoreBudgetId: existing.id,
    names: categoryCheck.names,
  });
  if (conflict) return fail(conflict);

  const requiresNewVersion =
    detectRelevantChange(existing, data) &&
    (data.scope === "future" ||
      (data.scope === "all" && existing.diaFechamento !== data.diaFechamento));

  try {
    if (requiresNewVersion && start > existing.dataInicio) {
      const previous = addMonths(start, -1);
      let newId = "";

      getDb().transaction((tx) => {
        tx.update(budgets)
          .set({
            dataFim:
              existing.dataFim && existing.dataFim < previous
                ? existing.dataFim
                : previous,
            updatedAt: new Date(),
          })
          .where(eq(budgets.id, existing.id))
          .run();

        newId = insertNewVersion(tx, existing, data, start);
      });

      revalidateBudgets();
      return { ok: true, id: newId };
    }

    // Atualização direta (inclui "todos" e início igual ao primeiro ciclo).
    getDb().transaction((tx) => {
      tx.update(budgets)
        .set({
          nome: data.nome,
          valorPadrao: data.valorPadrao,
          diaFechamento: data.diaFechamento,
          antecedenciaCiclos: data.antecedenciaCiclos,
          contaId: data.contaId ?? existing.contaId,
          dataInicio: start,
          dataFim: data.dataFim,
          cor: data.cor,
          icone: data.icone,
          updatedAt: new Date(),
          categoriaId: data.categoriaIds[0] as string,
          mes: start,
          valorLimite: data.valorPadrao,
        })
        .where(eq(budgets.id, existing.id))
        .run();

      replaceCategories(tx, existing.id, data.categoriaIds);
    });
  } catch (error) {
    console.error("[verde] erro ao atualizar orçamento:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Não foi possível salvar o orçamento.",
    );
  }

  revalidateBudgets();
  return { ok: true, id: existing.id };
}

export async function setBudgetOverrideAction(input: {
  budgetId: string;
  ciclo: string;
  valorCentavos: number;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = budgetOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const existing = listBudgetsWithCategories({ incluirArquivados: true }).find(
    (budget) => budget.id === parsed.data.budgetId,
  );
  if (!existing) return fail("Orçamento não encontrado.");

  if (
    parsed.data.ciclo < existing.dataInicio ||
    (existing.dataFim && parsed.data.ciclo > existing.dataFim)
  ) {
    return fail("O ciclo escolhido está fora da vigência deste orçamento.");
  }

  try {
    getDb()
      .insert(budgetOverrides)
      .values({
        budgetId: parsed.data.budgetId,
        ciclo: parsed.data.ciclo,
        valorCentavos: parsed.data.valorCentavos,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [budgetOverrides.budgetId, budgetOverrides.ciclo],
        set: {
          valorCentavos: parsed.data.valorCentavos,
          updatedAt: new Date(),
        },
      })
      .run();
  } catch (error) {
    console.error("[verde] erro ao ajustar orçamento:", error);
    return fail("Não foi possível ajustar o valor deste ciclo.");
  }

  revalidateBudgets();
  return { ok: true, id: parsed.data.budgetId };
}

export async function setBudgetArchivedAction(input: {
  id: string;
  arquivado: boolean;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z
    .object({ id: idSchema, arquivado: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("Orçamento inválido.");

  if (!parsed.data.arquivado) {
    const existing = listBudgetsWithCategories({
      incluirArquivados: true,
    }).find((budget) => budget.id === parsed.data.id);
    if (!existing) return fail("Orçamento não encontrado.");

    const categoriaIds = existing.categories.map((category) => category.id);
    const categoryCheck = validateCategories(categoriaIds);
    if (categoryCheck.error) return fail(categoryCheck.error);

    const conflict = conflictError(categoriaIds, {
      start: existing.dataInicio,
      end: existing.dataFim,
      ignoreBudgetId: existing.id,
      names: categoryCheck.names,
    });
    if (conflict) {
      return fail(
        `Não foi possível desarquivar: ${conflict.charAt(0).toLowerCase()}${conflict.slice(1)}`,
      );
    }
  }

  const result = getDb()
    .update(budgets)
    .set({ arquivado: parsed.data.arquivado, updatedAt: new Date() })
    .where(eq(budgets.id, parsed.data.id))
    .run();

  if (result.changes === 0) return fail("Orçamento não encontrado.");

  revalidateBudgets();
  return { ok: true, id: parsed.data.id };
}

export async function deleteBudgetAction(input: {
  id: string;
}): Promise<ActionResult> {
  await requireUser();

  const parsed = z.object({ id: idSchema }).safeParse(input);
  if (!parsed.success) return fail("Orçamento inválido.");

  // O cascade remove categorias sincronizadas e overrides. Lançamentos nunca
  // são tocados: o gasto real continua existindo fora do orçamento.
  const result = getDb()
    .delete(budgets)
    .where(eq(budgets.id, parsed.data.id))
    .run();

  if (result.changes === 0) return fail("Orçamento não encontrado.");

  revalidateBudgets();
  return { ok: true };
}

export type BudgetHint = {
  budgetId: string;
  nome: string;
  ciclo: string;
  limite: number;
  gasto: number;
  restante: number;
  estouro: number;
  fechamento: string;
};

/**
 * Informação ao vivo no modal de lançamento. Não bloqueia nada: apenas mostra
 * quanto resta no orçamento que cobre a categoria/data escolhidas.
 */
export async function getBudgetHintAction(input: {
  categoriaId: string;
  data: string;
  excludeTransactionId?: string | null;
}): Promise<BudgetHint | null> {
  await requireUser();

  const parsed = z
    .object({
      categoriaId: idSchema,
      data: isoDateSchema,
      excludeTransactionId: idSchema.nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return null;

  const { categoriaId, data, excludeTransactionId } = parsed.data;
  const categoryRows = getDb()
    .select({ id: categories.id, categoriaPaiId: categories.categoriaPaiId })
    .from(categories)
    .all();

  for (const budget of listBudgetsWithCategories()) {
    if (budget.arquivado) continue;
    const ciclo = cicloDaData(data, budget.diaFechamento);
    if (!orcamentoVigenteNoCiclo(budget, ciclo)) continue;

    const expanded = expandirCategorias(
      categoryRows,
      budget.categories.map((category) => category.id),
    );
    if (!expanded.has(categoriaId)) continue;

    const detail = getBudgetCycleDetail(budget.id, ciclo);
    if (!detail) return null;

    let gasto = detail.resumo.gasto;
    if (excludeTransactionId) {
      const transaction = getTransactionRaw(excludeTransactionId);
      if (
        transaction &&
        transaction.tipo === "despesa" &&
        transaction.categoriaId &&
        expanded.has(transaction.categoriaId) &&
        transaction.data >= detail.resumo.inicio &&
        transaction.data <= detail.resumo.fim
      ) {
        gasto = Math.max(0, gasto - transaction.valor);
      }
    }

    return {
      budgetId: budget.id,
      nome: budget.nome,
      ciclo,
      limite: detail.resumo.limite,
      gasto,
      restante: Math.max(0, detail.resumo.limite - gasto),
      estouro: Math.max(0, gasto - detail.resumo.limite),
      fechamento: detail.resumo.fechamento,
    };
  }

  return null;
}
