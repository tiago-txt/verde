"use server";

import {
  and,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { todayISO } from "@/lib/dates";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  ACCOUNT_TYPES,
  budgetCategories,
  budgetOverrides,
  budgets,
  CARD_BRANDS,
  CARD_CLOSING_BEHAVIORS,
  categories,
  CATEGORY_TYPES,
  creditCards,
  RECURRENCE_FREQUENCIES,
  recurrences,
  tags,
  transactionTags,
  transactions,
  TRANSACTION_TYPES,
  type RecurrenceTemplate,
} from "@/lib/db/schema";
import { getSystemCategoryIds } from "@/lib/db/queries/categories";
import {
  MAX_IMPORT_BYTES,
  importDuplicateKey,
  mapImportRows,
  type CsvMapping,
  type NormalizedImportRow,
} from "@/lib/finance/csv-import";
import { clampBudgetOffset } from "@/lib/finance/competence";
import { invalidateForecastCache } from "@/lib/db/queries/forecast";
import {
  importRequestSchema,
  type ImportRequestInput,
} from "@/lib/validation/import";
import type { ActionResult } from "./result";

type Db = ReturnType<typeof scopedDb>["db"];
type ImportOptions = { ignoreDuplicates: boolean; createMissing: boolean };

type PreparedRow = NormalizedImportRow & {
  accountId: string | null;
  categoryId: string | null;
  accountMissing: boolean;
  categoryMissing: boolean;
  duplicate: boolean;
};

export type ImportIssue = { line: number; message: string };

export type ImportPreview =
  | {
      ok: true;
      total: number;
      valid: number;
      invalid: number;
      duplicates: number;
      canImport: boolean;
      issues: ImportIssue[];
      duplicateIssues: ImportIssue[];
    }
  | { ok: false; error: string };

export type ImportResult =
  | {
      ok: true;
      imported: number;
      skippedInvalid: number;
      skippedDuplicates: number;
      batchId: string;
    }
  | { ok: false; error: string };

function fail(error: string) {
  return { ok: false as const, error };
}

export type JsonImportResult =
  | {
      ok: true;
      counts: {
        accounts: number;
        creditCards: number;
        categories: number;
        tags: number;
        recurrences: number;
        transactions: number;
        budgets: number;
      };
    }
  | { ok: false; error: string };

type JsonRecord = Record<string, unknown>;

function records(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? (value.filter(
        (item): item is JsonRecord =>
          Boolean(item) && typeof item === "object",
      ) as JsonRecord[])
    : [];
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function dateOrNull(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function pick<T extends readonly string[]>(
  options: T,
  value: unknown,
  fallback: T[number],
): T[number] {
  return options.includes(value as T[number]) ? (value as T[number]) : fallback;
}

function uniqueName(base: string, used: Set<string>): string {
  const clean = base.trim() || "Importado";
  let candidate = clean;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${clean} (${index})`;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const MAX_JSON_BYTES = 20 * 1024 * 1024;

function normalizeName(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function defaultAccountId(db: Db, workspaceId: string): string | null {
  const mostUsed = db
    .select({ contaId: transactions.contaId })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, workspaceId),
        isNull(transactions.deletedAt),
        isNotNull(transactions.contaId),
      ),
    )
    .groupBy(transactions.contaId)
    .orderBy(sql`count(*) desc`)
    .limit(1)
    .get();
  if (mostUsed?.contaId) return mostUsed.contaId;

  return (
    db
      .select({ id: accounts.id })
      .from(accounts)
      .where(
        and(
          eq(accounts.workspaceId, workspaceId),
          isNull(accounts.deletedAt),
          eq(accounts.arquivada, false),
        ),
      )
      .limit(1)
      .get()?.id ?? null
  );
}

async function prepareImport(
  workspaceId: string,
  input: ImportRequestInput,
): Promise<
  | {
      ok: true;
      rows: PreparedRow[];
      invalid: ImportIssue[];
      duplicates: number;
      total: number;
      options: ImportOptions;
      mapping: CsvMapping;
    }
  | { ok: false; error: string }
> {
  if (new TextEncoder().encode(input.csv).length > MAX_IMPORT_BYTES) {
    return fail("Arquivo acima do limite de 5 MB.");
  }

  const parsed = mapImportRows(input.csv, input.mapping);
  if (parsed.table.headers.length === 0) {
    return fail("CSV vazio ou sem cabeçalho.");
  }

  const { db } = scopedDb(workspaceId);
  const accountRows = db
    .select({ id: accounts.id, nome: accounts.nome })
    .from(accounts)
    .where(
      and(
        eq(accounts.workspaceId, workspaceId),
        isNull(accounts.deletedAt),
      ),
    )
    .all();
  const accountByName = new Map(
    accountRows.map((row) => [normalizeName(row.nome), row.id]),
  );
  const fallbackAccount = defaultAccountId(db, workspaceId);

  const categoryRows = db
    .select({
      id: categories.id,
      nome: categories.nome,
      tipo: categories.tipo,
      deletedAt: categories.deletedAt,
    })
    .from(categories)
    .where(eq(categories.workspaceId, workspaceId))
    .all();
  const categoryByName = new Map(
    categoryRows
      .filter((row) => !row.deletedAt)
      .map((row) => [`${row.tipo}:${normalizeName(row.nome)}`, row.id]),
  );
  const system = getSystemCategoryIds(workspaceId);
  const options = input.options;

  const invalid: ImportIssue[] = parsed.invalid.map((row) => ({
    line: row.line,
    message: row.message,
  }));
  const prepared: PreparedRow[] = [];
  const seen = new Set<string>();

  for (const row of parsed.valid) {
    const accountId = row.contaNome
      ? accountByName.get(normalizeName(row.contaNome)) ?? null
      : fallbackAccount;
    const accountMissing = !accountId;
    if (accountMissing && !options.createMissing) {
      invalid.push({
        line: row.line,
        message: `Conta "${row.contaNome ?? ""}" não encontrada`,
      });
      continue;
    }

    const categoryKey = row.categoriaNome
      ? `${row.tipo}:${normalizeName(row.categoriaNome)}`
      : "despesa:outros";
    const autoCategory = row.categoriaNome
      ? null
      : row.tipo === "despesa"
        ? system.despesa
        : system.receita;
    const categoryId = row.categoriaNome
      ? categoryByName.get(categoryKey) ?? null
      : autoCategory;
    const categoryMissing = !categoryId;
    if (categoryMissing && !options.createMissing) {
      invalid.push({
        line: row.line,
        message: row.categoriaNome
          ? `Categoria "${row.categoriaNome}" não encontrada`
          : "Categoria Outros não encontrada",
      });
      continue;
    }

    const duplicate = seen.has(row.duplicateKey);
    seen.add(row.duplicateKey);
    prepared.push({
      ...row,
      accountId,
      categoryId,
      accountMissing,
      categoryMissing,
      duplicate,
    });
  }

  // Duplicados contra lançamentos já existentes.
  const dates = [...new Set(prepared.map((row) => row.data))];
  const existing = dates.length
    ? db
        .select({
          data: transactions.data,
          valor: transactions.valor,
          descricao: transactions.descricao,
          contaId: transactions.contaId,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.workspaceId, workspaceId),
            isNull(transactions.deletedAt),
            inArray(transactions.data, dates),
          ),
        )
        .all()
    : [];

  const existingKeys = new Set(
    existing.map((row) =>
      importDuplicateKey({
        data: row.data,
        valor: row.valor,
        descricao: row.descricao,
        contaNome: row.contaId
          ? accountRows.find((account) => account.id === row.contaId)?.nome ??
            null
          : null,
      }),
    ),
  );

  let duplicates = 0;
  const rows = prepared.map((row) => {
    const duplicate =
      row.duplicate ||
      existingKeys.has(
        importDuplicateKey({
          data: row.data,
          valor: row.valor,
          descricao: row.descricao,
          contaNome:
            accountRows.find((account) => account.id === row.accountId)?.nome ??
            row.contaNome,
        }),
      );
    if (duplicate) duplicates += 1;
    return { ...row, duplicate };
  });

  return {
    ok: true,
    rows,
    invalid,
    duplicates,
    total: parsed.table.rows.length,
    options,
    mapping: input.mapping,
  };
}

export async function previewImportAction(
  input: ImportRequestInput,
): Promise<ImportPreview> {
  const user = await requireUser();
  const parsed = importRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const prepared = await prepareImport(user.workspaceId, parsed.data);
  if (!prepared.ok) return prepared;

  const importable = prepared.rows.filter(
    (row) => !row.duplicate || !prepared.options.ignoreDuplicates,
  );

  return {
    ok: true,
    total: prepared.total,
    valid: importable.length,
    invalid: prepared.invalid.length,
    duplicates: prepared.duplicates,
    canImport: importable.length > 0,
    issues: prepared.invalid.slice(0, 100),
    duplicateIssues: prepared.rows
      .filter((row) => row.duplicate)
      .slice(0, 100)
      .map((row) => ({
        line: row.line,
        message: "Duplicado (mesma data, valor, descrição e conta)",
      })),
  };
}

export async function importTransactionsAction(
  input: ImportRequestInput,
): Promise<ImportResult> {
  const user = await requireUser();
  const workspaceId = user.workspaceId;
  const parsed = importRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const prepared = await prepareImport(workspaceId, parsed.data);
  if (!prepared.ok) return prepared;

  const rows = prepared.rows.filter(
    (row) => !(prepared.options.ignoreDuplicates && row.duplicate),
  );
  if (rows.length === 0) {
    return fail(
      prepared.duplicates > 0
        ? "Todas as linhas são duplicadas."
        : "Nenhuma linha válida para importar.",
    );
  }

  const { db } = scopedDb(workspaceId);
  const batchId = crypto.randomUUID();
  const now = new Date();

  try {
    db.transaction((tx) => {
      const accountCache = new Map<string, string>();
      const categoryCache = new Map<string, string>();

      const resolveAccount = (row: PreparedRow): string => {
        if (row.accountId) return row.accountId;
        const name =
          (row.contaNome ?? "Conta importada").trim() || "Conta importada";
        const cacheKey = normalizeName(name);
        const cached = accountCache.get(cacheKey);
        if (cached) return cached;

        const id = crypto.randomUUID();
        tx.insert(accounts)
          .values({
            id,
            workspaceId,
            nome: name,
            tipo: "corrente",
            saldoInicial: 0,
            cor: "#34d399",
            icone: "Wallet",
            arquivada: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        accountCache.set(cacheKey, id);
        return id;
      };

      const resolveCategory = (row: PreparedRow): string => {
        if (row.categoryId) return row.categoryId;
        const system = getSystemCategoryIds(workspaceId);
        const name = (row.categoriaNome ?? "").trim();
        if (!name) {
          const fallback =
            row.tipo === "despesa" ? system.despesa : system.receita;
          if (fallback) return fallback;
        }

        const finalName = name || "Outros";
        const cacheKey = `${row.tipo}:${normalizeName(finalName)}`;
        const cached = categoryCache.get(cacheKey);
        if (cached) return cached;

        const existing = tx
          .select({ id: categories.id })
          .from(categories)
          .where(
            and(
              eq(categories.workspaceId, workspaceId),
              eq(categories.nome, finalName),
              eq(categories.tipo, row.tipo),
              isNull(categories.deletedAt),
            ),
          )
          .get();
        if (existing) {
          categoryCache.set(cacheKey, existing.id);
          return existing.id;
        }

        if (!prepared.options.createMissing && finalName !== "Outros") {
          throw new Error(`Categoria "${finalName}" não encontrada.`);
        }

        const id = crypto.randomUUID();
        tx.insert(categories)
          .values({
            id,
            workspaceId,
            nome: finalName,
            tipo: row.tipo,
            icone: row.tipo === "despesa" ? "CircleEllipsis" : "CirclePlus",
            cor: "#94a3b8",
            isSystem: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        categoryCache.set(cacheKey, id);
        return id;
      };

      for (const row of rows) {
        const accountId = resolveAccount(row);
        const categoryId = resolveCategory(row);
        tx.insert(transactions)
          .values({
            id: crypto.randomUUID(),
            workspaceId,
            tipo: row.tipo,
            descricao: row.descricao,
            valor: row.valor,
            data: row.data,
            pago: row.pago,
            contaId: accountId,
            cartaoId: null,
            contaDestinoId: null,
            cartaoDestinoId: null,
            faturaChave: null,
            categoriaId: categoryId,
            observacao: null,
            importBatchId: batchId,
            createdAt: now,
            updatedAt: now,
          })
          .run();
      }
    });
  } catch (error) {
    console.error("[verde] erro ao importar CSV:", error);
    return fail(
      error instanceof Error
        ? error.message
        : "Não foi possível importar o CSV.",
    );
  }

  revalidateAfterDataChange();
  return {
    ok: true,
    imported: rows.length,
    skippedInvalid: prepared.invalid.length,
    skippedDuplicates: prepared.options.ignoreDuplicates
      ? prepared.duplicates
      : 0,
    batchId,
  };
}

export async function undoLastImportAction(): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const lastRows = db
    .select({
      batchId: transactions.importBatchId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNotNull(transactions.importBatchId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(sql`${transactions.createdAt} desc`)
    .all();

  const last = lastRows[0];
  if (!last?.batchId) return fail("Nenhuma importação recente para desfazer.");

  const result = db
    .update(transactions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        ws(transactions.workspaceId),
        eq(transactions.importBatchId, last.batchId),
        isNull(transactions.deletedAt),
      ),
    )
    .run();

  revalidateAfterDataChange();
  return { ok: true, count: result.changes };
}

export async function importJsonAction(input: {
  json: string;
}): Promise<JsonImportResult> {
  const user = await requireUser();
  const workspaceId = user.workspaceId;

  if (new TextEncoder().encode(input.json).length > MAX_JSON_BYTES) {
    return fail("Arquivo acima do limite de 20 MB.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input.json);
  } catch {
    return fail("Arquivo JSON inválido.");
  }

  if (!parsed || typeof parsed !== "object") {
    return fail("Arquivo JSON inválido.");
  }
  const backup = parsed as { app?: unknown; data?: unknown };
  if (backup.app !== "verde" || !backup.data || typeof backup.data !== "object") {
    return fail("Este arquivo não é um backup do Verde.");
  }
  const data = backup.data as Record<string, unknown>;

  const { db, ws } = scopedDb(workspaceId);

  const counts = {
    accounts: 0,
    creditCards: 0,
    categories: 0,
    tags: 0,
    recurrences: 0,
    transactions: 0,
    budgets: 0,
  };

  const accountMap = new Map<string, string>();
  const cardMap = new Map<string, string>();
  const categoryMap = new Map<string, string>();
  const tagMap = new Map<string, string>();
  const recurrenceMap = new Map<string, string>();
  const budgetMap = new Map<string, string>();

  try {
    db.transaction((tx) => {
      // Contas
      const existingAccounts = tx
        .select({ nome: accounts.nome })
        .from(accounts)
        .where(ws(accounts.workspaceId))
        .all();
      const usedAccountNames = new Set(
        existingAccounts.map((row) => row.nome.toLowerCase()),
      );

      for (const row of records(data.accounts)) {
        const oldId = text(row.id);
        if (!oldId) continue;
        const id = crypto.randomUUID();
        accountMap.set(oldId, id);
        tx.insert(accounts)
          .values({
            id,
            workspaceId,
            nome: uniqueName(text(row.nome, "Conta importada"), usedAccountNames),
            tipo: pick(ACCOUNT_TYPES, row.tipo, "corrente"),
            saldoInicial: numberValue(row.saldoInicial),
            cor: text(row.cor, "#34d399"),
            icone: text(row.icone, "Wallet"),
            arquivada: booleanValue(row.arquivada),
            deletedAt: dateOrNull(row.deletedAt),
          })
          .run();
        counts.accounts += 1;
      }

      // Cartões (dependem das contas)
      const existingCards = tx
        .select({ nome: creditCards.nome })
        .from(creditCards)
        .where(ws(creditCards.workspaceId))
        .all();
      const usedCardNames = new Set(
        existingCards.map((row) => row.nome.toLowerCase()),
      );

      for (const row of records(data.creditCards)) {
        const oldId = text(row.id);
        if (!oldId) continue;
        const id = crypto.randomUUID();
        cardMap.set(oldId, id);
        tx.insert(creditCards)
          .values({
            id,
            workspaceId,
            nome: uniqueName(text(row.nome, "Cartão importado"), usedCardNames),
            bandeira: pick(CARD_BRANDS, row.bandeira, "outra"),
            limite: numberValue(row.limite),
            diaFechamento: Math.min(
              31,
              Math.max(1, numberValue(row.diaFechamento, 1)),
            ),
            diaVencimento: Math.min(
              31,
              Math.max(1, numberValue(row.diaVencimento, 1)),
            ),
            fechamentoCompra: pick(
              CARD_CLOSING_BEHAVIORS,
              row.fechamentoCompra,
              "proxima_fatura",
            ),
            contaPagamentoId: accountMap.get(text(row.contaPagamentoId)) ?? null,
            cor: text(row.cor, "#818cf8"),
            icone: text(row.icone, "CreditCard"),
            arquivado: booleanValue(row.arquivado),
            deletedAt: dateOrNull(row.deletedAt),
          })
          .run();
        counts.creditCards += 1;
      }

      // Categorias (pais antes das filhas)
      const existingCategories = tx
        .select({
          id: categories.id,
          nome: categories.nome,
          tipo: categories.tipo,
          isSystem: categories.isSystem,
        })
        .from(categories)
        .where(ws(categories.workspaceId))
        .all();
      const usedCategoryNames = new Map<string, Set<string>>();
      for (const row of existingCategories) {
        const set = usedCategoryNames.get(row.tipo) ?? new Set<string>();
        set.add(row.nome.toLowerCase());
        usedCategoryNames.set(row.tipo, set);
      }
      const systemByType = new Map<string, string>();
      for (const row of existingCategories) {
        if (row.isSystem) systemByType.set(row.tipo, row.id);
      }

      const categoryRows = records(data.categories);
      const orderedCategories = [
        ...categoryRows.filter((row) => !text(row.categoriaPaiId)),
        ...categoryRows.filter((row) => Boolean(text(row.categoriaPaiId))),
      ];
      for (const row of orderedCategories) {
        const oldId = text(row.id);
        if (!oldId) continue;
        const tipo = pick(CATEGORY_TYPES, row.tipo, "despesa");
        const isSystem = booleanValue(row.isSystem);
        if (isSystem && systemByType.has(tipo)) {
          categoryMap.set(oldId, systemByType.get(tipo) as string);
          continue;
        }

        const id = crypto.randomUUID();
        const usedNames = usedCategoryNames.get(tipo) ?? new Set<string>();
        usedCategoryNames.set(tipo, usedNames);
        const nome = isSystem
          ? text(row.nome, "Outros")
          : uniqueName(text(row.nome, "Categoria"), usedNames);
        if (isSystem) usedNames.add(nome.toLowerCase());
        tx.insert(categories)
          .values({
            id,
            workspaceId,
            nome,
            tipo,
            icone: text(row.icone, "CircleEllipsis"),
            cor: text(row.cor, "#94a3b8"),
            categoriaPaiId: categoryMap.get(text(row.categoriaPaiId)) ?? null,
            isSystem,
            deletedAt: dateOrNull(row.deletedAt),
          })
          .run();
        categoryMap.set(oldId, id);
        if (isSystem) systemByType.set(tipo, id);
        counts.categories += 1;
      }

      // Tags (reaproveita nomes existentes)
      const existingTags = tx
        .select({ id: tags.id, nome: tags.nome })
        .from(tags)
        .where(ws(tags.workspaceId))
        .all();
      const tagByName = new Map(
        existingTags.map((row) => [row.nome.toLowerCase(), row.id]),
      );
      for (const row of records(data.tags)) {
        const oldId = text(row.id);
        if (!oldId) continue;
        const nome = text(row.nome).trim();
        if (!nome) continue;
        const existing = tagByName.get(nome.toLowerCase());
        if (existing) {
          tagMap.set(oldId, existing);
          continue;
        }
        const id = crypto.randomUUID();
        tx.insert(tags).values({ id, workspaceId, nome }).run();
        tagByName.set(nome.toLowerCase(), id);
        tagMap.set(oldId, id);
        counts.tags += 1;
      }

      // Recorrências (remapeia o template)
      for (const row of records(data.recurrences)) {
        const oldId = text(row.id);
        if (!oldId) continue;
        const rawTemplate = (row.template ?? {}) as Partial<RecurrenceTemplate>;
        const template: RecurrenceTemplate = {
          tipo: pick(TRANSACTION_TYPES, rawTemplate.tipo, "despesa"),
          descricao: text(rawTemplate.descricao, "Recorrência importada"),
          valor: numberValue(rawTemplate.valor),
          contaId: accountMap.get(text(rawTemplate.contaId)) ?? null,
          cartaoId: cardMap.get(text(rawTemplate.cartaoId)) ?? null,
          contaDestinoId:
            accountMap.get(text(rawTemplate.contaDestinoId)) ?? null,
          categoriaId:
            categoryMap.get(text(rawTemplate.categoriaId)) ?? null,
          observacao: text(rawTemplate.observacao) || null,
          tagIds: Array.isArray(rawTemplate.tagIds)
            ? rawTemplate.tagIds
                .map((tagId) => tagMap.get(text(tagId)))
                .filter((tagId): tagId is string => Boolean(tagId))
            : [],
          pago: booleanValue(rawTemplate.pago),
          orcamentoDeslocamento: clampBudgetOffset(
            numberValue(rawTemplate.orcamentoDeslocamento),
          ),
          cartaoFechamento:
            typeof rawTemplate.cartaoFechamento === "number"
              ? rawTemplate.cartaoFechamento
              : null,
          cartaoVencimento:
            typeof rawTemplate.cartaoVencimento === "number"
              ? rawTemplate.cartaoVencimento
              : null,
          cartaoFechamentoCompra: pick(
            CARD_CLOSING_BEHAVIORS,
            rawTemplate.cartaoFechamentoCompra,
            "proxima_fatura",
          ),
        };

        const id = crypto.randomUUID();
        recurrenceMap.set(oldId, id);
        tx.insert(recurrences)
          .values({
            id,
            workspaceId,
            frequencia: pick(RECURRENCE_FREQUENCIES, row.frequencia, "mensal"),
            dataInicio: text(row.dataInicio, todayISO()),
            dataFim: text(row.dataFim) || null,
            ativo: booleanValue(row.ativo, true),
            template,
          })
          .run();
        counts.recurrences += 1;
      }

      // Lançamentos
      const transactionMap = new Map<string, string>();
      for (const row of records(data.transactions)) {
        const oldId = text(row.id);
        if (!oldId) continue;
        const id = crypto.randomUUID();
        transactionMap.set(oldId, id);
        tx.insert(transactions)
          .values({
            id,
            workspaceId,
            tipo: pick(TRANSACTION_TYPES, row.tipo, "despesa"),
            descricao: text(row.descricao, "Lançamento importado"),
            valor: Math.max(0, numberValue(row.valor)),
            data: text(row.data, todayISO()),
            pago: booleanValue(row.pago),
            contaId: accountMap.get(text(row.contaId)) ?? null,
            cartaoId: cardMap.get(text(row.cartaoId)) ?? null,
            contaDestinoId: accountMap.get(text(row.contaDestinoId)) ?? null,
            cartaoDestinoId:
              cardMap.get(text(row.cartaoDestinoId)) ?? null,
            faturaChave: text(row.faturaChave) || null,
            categoriaId: categoryMap.get(text(row.categoriaId)) ?? null,
            observacao: text(row.observacao) || null,
            recorrenciaId: recurrenceMap.get(text(row.recorrenciaId)) ?? null,
            parcelaAtual:
              typeof row.parcelaAtual === "number" ? row.parcelaAtual : null,
            parcelaTotal:
              typeof row.parcelaTotal === "number" ? row.parcelaTotal : null,
            parcelaGrupoId: text(row.parcelaGrupoId) || null,
            orcamentoDeslocamento: clampBudgetOffset(
              numberValue(row.orcamentoDeslocamento),
            ),
            cartaoFechamento:
              typeof row.cartaoFechamento === "number"
                ? row.cartaoFechamento
                : null,
            cartaoVencimento:
              typeof row.cartaoVencimento === "number"
                ? row.cartaoVencimento
                : null,
            cartaoFechamentoCompra: pick(
              CARD_CLOSING_BEHAVIORS,
              row.cartaoFechamentoCompra,
              "proxima_fatura",
            ),
            importBatchId: null,
            deletedAt: dateOrNull(row.deletedAt),
          })
          .run();
        counts.transactions += 1;
      }

      for (const row of records(data.transactionTags)) {
        const transactionId = transactionMap.get(text(row.transactionId));
        const tagId = tagMap.get(text(row.tagId));
        if (!transactionId || !tagId) continue;
        tx.insert(transactionTags)
          .values({ workspaceId, transactionId, tagId })
          .onConflictDoNothing()
          .run();
      }

      // Orçamentos
      for (const row of records(data.budgets)) {
        const oldId = text(row.id);
        if (!oldId) continue;
        const categoriaId = categoryMap.get(text(row.categoriaId));
        if (!categoriaId) continue;
        const id = crypto.randomUUID();
        budgetMap.set(oldId, id);
        tx.insert(budgets)
          .values({
            id,
            workspaceId,
            nome: text(row.nome, "Orçamento importado"),
            valorPadrao: Math.max(0, numberValue(row.valorPadrao)),
            diaFechamento: Math.min(
              31,
              Math.max(1, numberValue(row.diaFechamento, 1)),
            ),
            antecedenciaCiclos: numberValue(row.antecedenciaCiclos) === 1 ? 1 : 0,
            origens: pick(
              ["todas", "cartao", "contas"] as const,
              row.origens,
              "todas",
            ),
            contaId: accountMap.get(text(row.contaId)) ?? null,
            cartaoId: cardMap.get(text(row.cartaoId)) ?? null,
            dataInicio: text(row.dataInicio, currentMonthKey()),
            dataFim: text(row.dataFim) || null,
            cor: text(row.cor, "#34d399"),
            icone: text(row.icone, "Target"),
            arquivado: booleanValue(row.arquivado),
            categoriaId,
            mes: text(row.mes, text(row.dataInicio, currentMonthKey())),
            valorLimite: Math.max(
              0,
              numberValue(row.valorLimite, numberValue(row.valorPadrao)),
            ),
          })
          .run();
        counts.budgets += 1;
      }

      for (const row of records(data.budgetCategories)) {
        const budgetId = budgetMap.get(text(row.budgetId));
        const categoryId = categoryMap.get(text(row.categoryId));
        if (!budgetId || !categoryId) continue;
        tx.insert(budgetCategories)
          .values({ workspaceId, budgetId, categoryId })
          .onConflictDoNothing()
          .run();
      }

      for (const row of records(data.budgetOverrides)) {
        const budgetId = budgetMap.get(text(row.budgetId));
        const ciclo = text(row.ciclo);
        if (!budgetId || !ciclo) continue;
        tx.insert(budgetOverrides)
          .values({
            workspaceId,
            budgetId,
            ciclo,
            valorCentavos: Math.max(0, numberValue(row.valorCentavos)),
            createdAt: dateOrNull(row.createdAt) ?? new Date(),
            updatedAt: dateOrNull(row.updatedAt) ?? new Date(),
          })
          .onConflictDoNothing()
          .run();
      }
    });
  } catch (error) {
    console.error("[verde] erro ao importar JSON:", error);
    return fail(
      error instanceof Error
        ? `Não foi possível restaurar o backup: ${error.message}`
        : "Não foi possível restaurar o backup.",
    );
  }

  revalidateAfterDataChange();
  return { ok: true, counts };
}

function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

function revalidateAfterDataChange() {
  invalidateForecastCache();
  revalidatePath("/");
  revalidatePath("/lancamentos");
  revalidatePath("/contas");
  revalidatePath("/cartoes", "layout");
  revalidatePath("/limite-de-gastos");
  revalidatePath("/relatorios");
  revalidatePath("/configuracoes/dados");
}
