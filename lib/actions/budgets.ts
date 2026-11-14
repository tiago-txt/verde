"use server";

import { and, eq, gte, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { addMonths, currentMonth, todayISO } from "@/lib/dates";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  budgetCategories,
  budgetCycleExceptions,
  budgetOverrides,
  budgetVersions,
  budgets,
  categories,
  creditCards,
  type BudgetVersionData,
} from "@/lib/db/schema";
import {
  getBudgetCycleDetail,
  getDefaultBudgetAccountId,
  loadBudgetSeries,
} from "@/lib/db/queries/budgets";
import { listAllCategories } from "@/lib/db/queries/categories";
import { getTransactionRaw } from "@/lib/db/queries/transactions";
import { invalidateForecastCache } from "@/lib/db/queries/forecast";
import {
  calcularCiclo,
  ciclosEntre,
  ciclosRelevantesParaMes,
  cicloDaData,
  expandirCategorias,
  resolverCiclo,
  transacaoConsomeOrcamento,
} from "@/lib/finance/budgets";
import { cicloCompetencia, faturaDaTransacao } from "@/lib/finance/competence";
import { idSchema, isoDateSchema } from "@/lib/validation/common";
import {
  budgetOverrideSchema,
  createBudgetSchema,
  updateBudgetSchema,
  type BudgetFormValues,
  type UpdateBudgetInput,
} from "@/lib/validation/budgets";
import type { ActionResult } from "./result";

type Db = ReturnType<typeof scopedDb>["db"];
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

function fail(error: string): ActionResult {
  return { ok: false, error };
}

function revalidateBudgets() {
  invalidateForecastCache();
  revalidatePath("/limite-de-gastos");
  revalidatePath("/lancamentos");
  revalidatePath("/");
  revalidatePath("/contas");
}

function validateCategories(
  workspaceId: string,
  categoriaIds: string[],
): { error?: string; names?: Map<string, string> } {
  const rows = listAllCategories(workspaceId);
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

/** Garante que conta/cartão vinculados pertencem ao workspace da sessão. */
function validateBudgetLinks(
  workspaceId: string,
  contaId: string | null,
  cartaoId: string | null,
): string | null {
  const { db, ws } = scopedDb(workspaceId);

  if (contaId) {
    const account = db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.id, contaId),
          ws(accounts.workspaceId),
          isNull(accounts.deletedAt),
        ),
      )
      .get();
    if (!account) return "Conta não encontrada.";
  }

  if (cartaoId) {
    const card = db
      .select({ id: creditCards.id })
      .from(creditCards)
      .where(
        and(
          eq(creditCards.id, cartaoId),
          ws(creditCards.workspaceId),
          isNull(creditCards.deletedAt),
        ),
      )
      .get();
    if (!card) return "Cartão não encontrado.";
  }

  return null;
}

function conflictError(
  workspaceId: string,
  selectedRootIds: string[],
  start: string,
  end: string | null,
  ignoreBudgetId?: string,
): string | null {
  const categories = listAllCategories(workspaceId).map((category) => ({
    id: category.id,
    categoriaPaiId: category.categoriaPaiId,
    nome: category.nome,
  }));
  const selected = expandirCategorias(categories, selectedRootIds);
  const series = loadBudgetSeries(workspaceId);

  // Para séries sem fim, valida uma janela segura de ciclos. O usuário pode
  // criar um orçamento futuro depois; nesse momento a validação roda de novo.
  const rangeEnd = end ?? addMonths(currentMonth(), 24);
  const cycles = ciclosEntre(start, rangeEnd, 120);

  for (const row of series) {
    if (ignoreBudgetId && row.id === ignoreBudgetId) continue;
    for (const ciclo of cycles) {
      const resolved = resolverCiclo(row, ciclo);
      if (!resolved) continue;
      const covered = expandirCategorias(categories, resolved.categoriaIds);
      for (const id of selected) {
        if (covered.has(id)) {
          const name =
            categories.find((category) => category.id === id)?.nome ??
            "uma categoria";
          return `A categoria "${name}" já está no orçamento "${resolved.nome}" no ciclo ${ciclo}.`;
        }
      }
    }
  }

  return null;
}

function replaceLegacyCategories(
  tx: Tx,
  workspaceId: string,
  budgetId: string,
  ids: string[],
) {
  tx.delete(budgetCategories)
    .where(
      and(
        eq(budgetCategories.budgetId, budgetId),
        eq(budgetCategories.workspaceId, workspaceId),
      ),
    )
    .run();
  if (ids.length > 0) {
    tx.insert(budgetCategories)
      .values(ids.map((categoryId) => ({ workspaceId, budgetId, categoryId })))
      .onConflictDoNothing()
      .run();
  }
}

function versionDataFromForm(
  data: BudgetFormValues,
  categoriaIds: string[],
  contaId: string | null,
): BudgetVersionData {
  return {
    nome: data.nome,
    valorPadrao: data.valorPadrao,
    diaFechamento: data.diaFechamento,
    antecedenciaCiclos: data.antecedenciaCiclos,
    origens: data.origens,
    contaId,
    cartaoId: data.cartaoId ?? null,
    cor: data.cor,
    icone: data.icone,
    categoriaIds,
  };
}

function insertVersion(
  tx: Tx,
  workspaceId: string,
  budgetId: string,
  vigenteApartir: string,
  data: BudgetVersionData,
) {
  tx.insert(budgetVersions)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      budgetId,
      vigenteApartir,
      ...data,
      // Colunas deprecated mantidas no banco apenas por compatibilidade.
      dataDaReserva: "inicio_do_ciclo",
      diaVencimento: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();
}

function deleteVersionsFrom(
  tx: Tx,
  workspaceId: string,
  budgetId: string,
  ciclo: string,
) {
  tx.delete(budgetVersions)
    .where(
      and(
        eq(budgetVersions.workspaceId, workspaceId),
        eq(budgetVersions.budgetId, budgetId),
        gte(budgetVersions.vigenteApartir, ciclo),
      ),
    )
    .run();
}

function deleteExceptionsFrom(
  tx: Tx,
  workspaceId: string,
  budgetId: string,
  ciclo: string,
) {
  tx.delete(budgetCycleExceptions)
    .where(
      and(
        eq(budgetCycleExceptions.workspaceId, workspaceId),
        eq(budgetCycleExceptions.budgetId, budgetId),
        gte(budgetCycleExceptions.ciclo, ciclo),
      ),
    )
    .run();
}

function upsertException(
  tx: Tx,
  workspaceId: string,
  budgetId: string,
  ciclo: string,
  tipo: "excluido" | "ajustado",
  dados: Partial<BudgetVersionData> | null,
) {
  tx.insert(budgetCycleExceptions)
    .values({
      id: crypto.randomUUID(),
      workspaceId,
      budgetId,
      ciclo,
      tipo,
      dados,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        budgetCycleExceptions.budgetId,
        budgetCycleExceptions.ciclo,
      ],
      set: { tipo, dados, updatedAt: new Date() },
    })
    .run();
}

export async function createBudgetAction(
  input: BudgetFormValues,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db } = scopedDb(user.workspaceId);
  const workspaceId = user.workspaceId;

  const parsed = createBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  const categoryCheck = validateCategories(workspaceId, data.categoriaIds);
  if (categoryCheck.error) return fail(categoryCheck.error);
  if (data.sobraPolicy === "realocar") {
    if (!data.sobraDestinoBudgetId) {
      return fail("Escolha o orçamento de destino da sobra.");
    }
    const destination = loadBudgetSeries(workspaceId, {
      incluirArquivados: true,
    }).find((row) => row.id === data.sobraDestinoBudgetId);
    if (!destination || destination.arquivado) {
      return fail("Orçamento de destino inválido.");
    }
  }  const linkError = validateBudgetLinks(
    workspaceId,
    data.contaId ?? null,
    data.cartaoId ?? null,
  );
  if (linkError) return fail(linkError);

  const conflict = conflictError(
    workspaceId,
    data.categoriaIds,
    data.dataInicio,
    data.dataFim,
  );
  if (conflict) return fail(conflict);

  const id = crypto.randomUUID();
  const now = new Date();
  const contaId = data.contaId ?? getDefaultBudgetAccountId(workspaceId);
  const versionData = versionDataFromForm(data, data.categoriaIds, contaId);

  try {
    db.transaction((tx) => {
      tx.insert(budgets)
        .values({
          id,
          workspaceId,
          nome: data.nome,
          valorPadrao: data.valorPadrao,
          diaFechamento: data.diaFechamento,
          antecedenciaCiclos: data.antecedenciaCiclos,
          origens: data.origens,
          sobraPolicy: data.sobraPolicy ?? "liberar",
          sobraDestinoBudgetId:
            data.sobraPolicy === "realocar"
              ? (data.sobraDestinoBudgetId ?? null)
              : null,
          cartaoId: data.cartaoId ?? null,
          contaId,
          dataInicio: data.dataInicio,
          dataFim: data.dataFim,
          cor: data.cor,
          icone: data.icone,
          arquivado: false,
          createdAt: now,
          updatedAt: now,
          categoriaId: data.categoriaIds[0] as string,
          mes: data.dataInicio,
          valorLimite: data.valorPadrao,
        })
        .run();

      insertVersion(tx, workspaceId, id, data.dataInicio, versionData);
      replaceLegacyCategories(tx, workspaceId, id, data.categoriaIds);
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
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);
  const workspaceId = user.workspaceId;

  const parsed = updateBudgetSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const data = parsed.data;
  const series = loadBudgetSeries(workspaceId, { incluirArquivados: true }).find(
    (row) => row.id === data.id,
  );
  if (!series) return fail("Orçamento não encontrado.");

  if (data.sobraPolicy === "realocar") {
    if (!data.sobraDestinoBudgetId) {
      return fail("Escolha o orçamento de destino da sobra.");
    }
    if (data.sobraDestinoBudgetId === series.id) {
      return fail("Escolha um orçamento de destino diferente.");
    }
    const destination = loadBudgetSeries(workspaceId, {
      incluirArquivados: true,
    }).find((row) => row.id === data.sobraDestinoBudgetId);
    if (!destination || destination.arquivado) {
      return fail("Orçamento de destino inválido.");
    }
  }

  const categoryCheck = validateCategories(workspaceId, data.categoriaIds);
  if (categoryCheck.error) return fail(categoryCheck.error);
  const linkError = validateBudgetLinks(
    workspaceId,
    data.contaId ?? null,
    data.cartaoId ?? null,
  );
  if (linkError) return fail(linkError);

  const scope = data.scope;
  const ciclo = data.ciclo;
  const start =
    scope === "single"
      ? ciclo
      : scope === "future"
        ? ciclo
        : data.dataInicio;
  const end = scope === "single" ? ciclo : data.dataFim;

  if (scope === "single") {
    const exception = series.exceptions.find(
      (item) => item.ciclo === ciclo && item.tipo === "excluido",
    );
    if (exception) {
      return fail("Este ciclo está excluído. Restaure-o antes de editar.");
    }
  }

  if (scope !== "all" && ciclo < series.dataInicio) {
    return fail("O ciclo escolhido está antes do início desta série.");
  }
  if (scope !== "all" && series.dataFim && ciclo > series.dataFim) {
    return fail("O ciclo escolhido está depois do fim desta série.");
  }
  if (end && end < start) {
    return fail("O fim deve ser depois do início.");
  }

  const conflict = conflictError(
    workspaceId,
    data.categoriaIds,
    start,
    end,
    series.id,
  );
  if (conflict) return fail(conflict);

  const contaId =
    data.contaId ?? getDefaultBudgetAccountId(workspaceId);
  const versionData = versionDataFromForm(
    data,
    data.categoriaIds,
    contaId,
  );
  const now = new Date();

  try {
    db.transaction((tx) => {
      if (data.sobraPolicy !== undefined) {
        tx.update(budgets)
          .set({
            sobraPolicy: data.sobraPolicy,
            sobraDestinoBudgetId:
              data.sobraPolicy === "realocar"
                ? (data.sobraDestinoBudgetId ?? null)
                : null,
            updatedAt: now,
          })
          .where(and(eq(budgets.id, series.id), ws(budgets.workspaceId)))
          .run();
      }
      if (scope === "single") {
        // Exceção do ciclo: sobrepõe valor, categorias, fechamento etc.
        upsertException(
          tx,
          workspaceId,
          series.id,
          ciclo,
          "ajustado",
          versionData,
        );
        // Compatibilidade com o mecanismo antigo de override de valor.
        tx.insert(budgetOverrides)
          .values({
            workspaceId,
            budgetId: series.id,
            ciclo,
            valorCentavos: data.valorPadrao,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [budgetOverrides.budgetId, budgetOverrides.ciclo],
            set: {
              valorCentavos: data.valorPadrao,
              updatedAt: now,
            },
          })
          .run();
        return;
      }

      if (scope === "future") {
        // Ciclos anteriores ficam como estavam; do ciclo em diante, uma nova
        // vigência substitui versões/exceções futuras.
        if (ciclo <= series.dataInicio) {
          tx.delete(budgetVersions)
            .where(
              and(
                eq(budgetVersions.workspaceId, workspaceId),
                eq(budgetVersions.budgetId, series.id),
              ),
            )
            .run();
          tx.delete(budgetCycleExceptions)
            .where(
              and(
                eq(budgetCycleExceptions.workspaceId, workspaceId),
                eq(budgetCycleExceptions.budgetId, series.id),
              ),
            )
            .run();
          insertVersion(tx, workspaceId, series.id, series.dataInicio, versionData);
        } else {
          deleteVersionsFrom(tx, workspaceId, series.id, ciclo);
          deleteExceptionsFrom(tx, workspaceId, series.id, ciclo);
          insertVersion(tx, workspaceId, series.id, ciclo, versionData);
        }

        tx.update(budgets)
          .set({
            dataFim: data.dataFim,
            updatedAt: now,
          })
          .where(
            and(eq(budgets.id, series.id), ws(budgets.workspaceId)),
          )
          .run();
        return;
      }

      // Todos: uma única vigência com os novos valores, sem exceções.
      tx.delete(budgetVersions)
        .where(
          and(
            eq(budgetVersions.workspaceId, workspaceId),
            eq(budgetVersions.budgetId, series.id),
          ),
        )
        .run();
      tx.delete(budgetCycleExceptions)
        .where(
          and(
            eq(budgetCycleExceptions.workspaceId, workspaceId),
            eq(budgetCycleExceptions.budgetId, series.id),
          ),
        )
        .run();
      insertVersion(tx, workspaceId, series.id, data.dataInicio, versionData);

      tx.update(budgets)
        .set({
          nome: data.nome,
          valorPadrao: data.valorPadrao,
          diaFechamento: data.diaFechamento,
          antecedenciaCiclos: data.antecedenciaCiclos,
          origens: data.origens,
          cartaoId: data.cartaoId ?? null,
          contaId,
          dataInicio: data.dataInicio,
          dataFim: data.dataFim,
          cor: data.cor,
          icone: data.icone,
          updatedAt: now,
          categoriaId: data.categoriaIds[0] as string,
          mes: data.dataInicio,
          valorLimite: data.valorPadrao,
        })
        .where(
          and(eq(budgets.id, series.id), ws(budgets.workspaceId)),
        )
        .run();

      replaceLegacyCategories(tx, workspaceId, series.id, data.categoriaIds);
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
  return { ok: true, id: series.id };
}

export async function setBudgetOverrideAction(input: {
  budgetId: string;
  ciclo: string;
  valorCentavos: number;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db } = scopedDb(user.workspaceId);
  const workspaceId = user.workspaceId;

  const parsed = budgetOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const series = loadBudgetSeries(workspaceId, { incluirArquivados: true }).find(
    (row) => row.id === parsed.data.budgetId,
  );
  if (!series) return fail("Orçamento não encontrado.");
  const resolved = resolverCiclo(series, parsed.data.ciclo);
  if (!resolved) return fail("O ciclo escolhido não existe neste orçamento.");

  try {
    db.transaction((tx) => {
      const existing = series.exceptions.find(
        (item) => item.ciclo === parsed.data.ciclo,
      );
      const dados = {
        ...(existing?.tipo === "ajustado" ? (existing.dados ?? {}) : {}),
        valorPadrao: parsed.data.valorCentavos,
      };
      upsertException(
        tx,
        workspaceId,
        series.id,
        parsed.data.ciclo,
        "ajustado",
        dados,
      );
      tx.insert(budgetOverrides)
        .values({
          workspaceId,
          budgetId: series.id,
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
    });
  } catch (error) {
    console.error("[verde] erro ao ajustar orçamento:", error);
    return fail("Não foi possível ajustar o valor deste ciclo.");
  }

  revalidateBudgets();
  return { ok: true, id: series.id };
}

export async function setBudgetArchivedAction(input: {
  id: string;
  arquivado: boolean;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = z
    .object({ id: idSchema, arquivado: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return fail("Orçamento inválido.");

  const result = db
    .update(budgets)
    .set({ arquivado: parsed.data.arquivado, updatedAt: new Date() })
    .where(
      and(eq(budgets.id, parsed.data.id), ws(budgets.workspaceId)),
    )
    .run();

  if (result.changes === 0) return fail("Orçamento não encontrado.");

  revalidateBudgets();
  return { ok: true, id: parsed.data.id };
}

export async function deleteBudgetAction(input: {
  id: string;
  ciclo?: string;
  scope?: "single" | "future" | "all";
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);
  const workspaceId = user.workspaceId;

  const parsed = z
    .object({
      id: idSchema,
      ciclo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
      scope: z.enum(["single", "future", "all"]).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Orçamento inválido.");

  const scope = parsed.data.scope ?? "all";
  const ciclo = parsed.data.ciclo;
  const series = loadBudgetSeries(workspaceId, { incluirArquivados: true }).find(
    (row) => row.id === parsed.data.id,
  );
  if (!series) return fail("Orçamento não encontrado.");
  if (scope !== "all") {
    if (!ciclo) return fail("Ciclo obrigatório.");
    if (ciclo < series.dataInicio) {
      return fail("O ciclo escolhido está antes do início desta série.");
    }
    if (series.dataFim && ciclo > series.dataFim) {
      return fail("O ciclo escolhido está depois do fim desta série.");
    }
  }

  try {
    db.transaction((tx) => {
      if (scope === "single") {
        if (!ciclo) throw new Error("Ciclo obrigatório.");
        const existing = series.exceptions.find(
          (item) => item.ciclo === ciclo,
        );
        upsertException(
          tx,
          workspaceId,
          series.id,
          ciclo,
          "excluido",
          existing?.tipo === "ajustado" ? (existing.dados ?? null) : null,
        );
        return;
      }

      if (scope === "future") {
        if (!ciclo) throw new Error("Ciclo obrigatório.");
        if (ciclo <= series.dataInicio) {
          tx.delete(budgets)
            .where(
              and(eq(budgets.id, series.id), ws(budgets.workspaceId)),
            )
            .run();
          return;
        }
        tx.update(budgets)
          .set({
            dataFim: addMonths(ciclo, -1),
            updatedAt: new Date(),
          })
          .where(
            and(eq(budgets.id, series.id), ws(budgets.workspaceId)),
          )
          .run();
        return;
      }

      // Todos: remove a série, versões, exceções e vínculos; lançamentos ficam.
      tx.delete(budgets)
        .where(and(eq(budgets.id, series.id), ws(budgets.workspaceId)))
        .run();
    });
  } catch (error) {
    console.error("[verde] erro ao excluir orçamento:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Não foi possível excluir o orçamento.",
    );
  }

  revalidateBudgets();
  return { ok: true };
}

export async function restoreBudgetCycleAction(input: {
  id: string;
  ciclo: string;
}): Promise<ActionResult> {
  const user = await requireUser();
  const { db } = scopedDb(user.workspaceId);
  const workspaceId = user.workspaceId;

  const parsed = z
    .object({
      id: idSchema,
      ciclo: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    })
    .safeParse(input);
  if (!parsed.success) return fail("Ciclo inválido.");

  const exception = db
    .select()
    .from(budgetCycleExceptions)
    .where(
      and(
        eq(budgetCycleExceptions.workspaceId, workspaceId),
        eq(budgetCycleExceptions.budgetId, parsed.data.id),
        eq(budgetCycleExceptions.ciclo, parsed.data.ciclo),
        eq(budgetCycleExceptions.tipo, "excluido"),
      ),
    )
    .get();
  if (!exception) return fail("Ciclo excluído não encontrado.");

  const result = exception.dados
    ? db
        .update(budgetCycleExceptions)
        .set({ tipo: "ajustado", updatedAt: new Date() })
        .where(eq(budgetCycleExceptions.id, exception.id))
        .run()
    : db
        .delete(budgetCycleExceptions)
        .where(eq(budgetCycleExceptions.id, exception.id))
        .run();

  if (result.changes === 0) return fail("Ciclo excluído não encontrado.");

  revalidateBudgets();
  return { ok: true, id: parsed.data.id };
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
  viaFatura: string | null;
};

/**
 * Informação ao vivo no modal de lançamento. Não bloqueia nada: apenas mostra
 * quanto resta no orçamento que cobre a categoria/data escolhidas.
 */
export async function getBudgetHintAction(input: {
  categoriaId: string;
  data: string;
  cartaoId?: string | null;
  orcamentoDeslocamento?: number | null;
  excludeTransactionId?: string | null;
}): Promise<BudgetHint | null> {
  const user = await requireUser();
  const workspaceId = user.workspaceId;

  const parsed = z
    .object({
      categoriaId: idSchema,
      data: isoDateSchema,
      cartaoId: idSchema.nullable().optional(),
      orcamentoDeslocamento: z.number().int().min(-2).max(2).optional(),
      excludeTransactionId: idSchema.nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return null;

  const {
    categoriaId,
    data,
    cartaoId,
    orcamentoDeslocamento,
    excludeTransactionId,
  } = parsed.data;
  const series = loadBudgetSeries(workspaceId);
  const categories = listAllCategories(workspaceId);
  const { db, ws } = scopedDb(workspaceId);
  const cardRows = db
    .select({
      id: creditCards.id,
      diaFechamento: creditCards.diaFechamento,
      diaVencimento: creditCards.diaVencimento,
      fechamentoCompra: creditCards.fechamentoCompra,
    })
    .from(creditCards)
    .where(ws(creditCards.workspaceId))
    .all();
  const cardById = new Map(cardRows.map((card) => [card.id, card]));
  const card = cartaoId ? cardById.get(cartaoId) : null;
  const monthKey = data.slice(0, 7);
  const candidateCycles = new Set<string>();
  for (let delta = -6; delta <= 6; delta += 1) {
    candidateCycles.add(addMonths(monthKey, delta));
  }

  for (const row of series) {
    if (row.arquivado) continue;
    for (const ciclo of candidateCycles) {
      const resolved = resolverCiclo(row, ciclo);
      if (!resolved) continue;

      const consumed = cicloCompetencia(
        {
          tipo: "despesa",
          data,
          cartaoId: cartaoId ?? null,
          orcamentoDeslocamento,
        },
        resolved.diaFechamento,
        card,
      );
      if (consumed !== ciclo) continue;

      const expanded = expandirCategorias(categories, resolved.categoriaIds);
      if (!expanded.has(categoriaId)) continue;
      if (!transacaoConsomeOrcamento(resolved.origens, cartaoId)) continue;

      const detail = getBudgetCycleDetail(workspaceId, row.id, ciclo);
      if (!detail) return null;

      let gasto = detail.resumo.gasto;
      if (excludeTransactionId) {
        const transaction = getTransactionRaw(workspaceId, excludeTransactionId);
        const transactionCard = transaction?.cartaoId
          ? cardById.get(transaction.cartaoId)
          : null;
        if (
          transaction &&
          transaction.tipo !== "transferencia" &&
          transaction.categoriaId &&
          expanded.has(transaction.categoriaId) &&
          transacaoConsomeOrcamento(resolved.origens, transaction.cartaoId) &&
          cicloCompetencia(
            {
              tipo: transaction.tipo,
              data: transaction.data,
              cartaoId: transaction.cartaoId,
              orcamentoDeslocamento: transaction.orcamentoDeslocamento,
            },
            resolved.diaFechamento,
            transactionCard,
          ) === ciclo
        ) {
          const signed =
            transaction.tipo === "despesa"
              ? transaction.valor
              : -transaction.valor;
          gasto = Math.max(0, gasto - signed);
        }
      }

      return {
        budgetId: row.id,
        nome: resolved.nome,
        ciclo,
        limite: detail.resumo.limite,
        gasto,
        restante: Math.max(0, detail.resumo.limite - gasto),
        estouro: Math.max(0, gasto - detail.resumo.limite),
        fechamento: detail.resumo.fechamento,
        viaFatura: faturaDaTransacao(
          { tipo: "despesa", data, cartaoId: cartaoId ?? null },
          card,
        )?.vencimento ?? null,
      };
    }
  }

  return null;
}
