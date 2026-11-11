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
import { getDb } from "@/lib/db";
import { accounts, categories, transactions } from "@/lib/db/schema";
import { getSystemCategoryIds } from "@/lib/db/queries/categories";
import {
  MAX_IMPORT_BYTES,
  importDuplicateKey,
  mapImportRows,
  type CsvMapping,
  type NormalizedImportRow,
} from "@/lib/finance/csv-import";
import {
  importRequestSchema,
  type ImportRequestInput,
} from "@/lib/validation/import";
import type { ActionResult } from "./result";

type Db = ReturnType<typeof getDb>;
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

function normalizeName(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function defaultAccountId(db: Db): string | null {
  const mostUsed = db
    .select({ contaId: transactions.contaId })
    .from(transactions)
    .where(
      and(isNull(transactions.deletedAt), isNotNull(transactions.contaId)),
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
      .where(and(isNull(accounts.deletedAt), eq(accounts.arquivada, false)))
      .limit(1)
      .get()?.id ?? null
  );
}

async function prepareImport(
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

  const db = getDb();
  const accountRows = db
    .select({ id: accounts.id, nome: accounts.nome })
    .from(accounts)
    .where(isNull(accounts.deletedAt))
    .all();
  const accountByName = new Map(
    accountRows.map((row) => [normalizeName(row.nome), row.id]),
  );
  const fallbackAccount = defaultAccountId(db);

  const categoryRows = db
    .select({
      id: categories.id,
      nome: categories.nome,
      tipo: categories.tipo,
      deletedAt: categories.deletedAt,
    })
    .from(categories)
    .all();
  const categoryByName = new Map(
    categoryRows
      .filter((row) => !row.deletedAt)
      .map((row) => [`${row.tipo}:${normalizeName(row.nome)}`, row.id]),
  );
  const system = getSystemCategoryIds();
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
  await requireUser();
  const parsed = importRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const prepared = await prepareImport(parsed.data);
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
  await requireUser();
  const parsed = importRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const prepared = await prepareImport(parsed.data);
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

  const db = getDb();
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
        const system = getSystemCategoryIds();
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
  await requireUser();

  const lastRows = getDb()
    .select({
      batchId: transactions.importBatchId,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(
      and(
        isNotNull(transactions.importBatchId),
        isNull(transactions.deletedAt),
      ),
    )
    .orderBy(sql`${transactions.createdAt} desc`)
    .all();

  const last = lastRows[0];
  if (!last?.batchId) return fail("Nenhuma importação recente para desfazer.");

  const result = getDb()
    .update(transactions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(transactions.importBatchId, last.batchId),
        isNull(transactions.deletedAt),
      ),
    )
    .run();

  revalidateAfterDataChange();
  return { ok: true, count: result.changes };
}

function revalidateAfterDataChange() {
  revalidatePath("/");
  revalidatePath("/lancamentos");
  revalidatePath("/contas");
  revalidatePath("/cartoes", "layout");
  revalidatePath("/limite-de-gastos");
  revalidatePath("/relatorios");
  revalidatePath("/configuracoes/dados");
}
