"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { scopedDb } from "@/lib/db/scoped";
import {
  accounts,
  categories,
  creditCards,
  importBatches,
  tags,
  transactionTags,
  transactions,
  type ImportBatchCounts,
} from "@/lib/db/schema";
import { getSystemCategoryIds } from "@/lib/db/queries/categories";
import { findImportBatchByHash } from "@/lib/db/queries/data-export";
import { invalidateForecastCache } from "@/lib/db/queries/forecast";
import { formatCurrency } from "@/lib/format";
import {
  faturaDaCompra,
  type CardCycleConfig,
} from "@/lib/finance/cards";
import {
  classifySpecialRow,
  investmentGroupKey,
  normalizeEntityName,
  parsePaymentDescription,
  spreadsheetDuplicateKey,
} from "@/lib/finance/spreadsheet-import";
import {
  spreadsheetImportRequestSchema,
  type CanonicalSpreadsheetRowInput,
  type SpreadsheetDecisionsInput,
  type SpreadsheetImportRequestInput,
} from "@/lib/validation/import";

type Db = ReturnType<typeof scopedDb>["db"];

type SpreadsheetServerIssue = {
  sheetName: string;
  sourceRow: number;
  message: string;
  severity: "error" | "warning";
};

type PlannedRow = {
  rowId: string;
  sheetName: string;
  sourceRow: number;
  data: string;
  descricao: string;
  tipo: "despesa" | "receita" | "transferencia";
  valor: number;
  pago: boolean;
  contaRef: string | null;
  cartaoRef: string | null;
  contaDestinoRef: string | null;
  cartaoDestinoRef: string | null;
  categoriaRef: string | null;
  faturaChave: string | null;
  faturaChaveOverride: string | null;
  observacao: string | null;
  parcelaAtual: number | null;
  parcelaTotal: number | null;
  parcelaGrupoId: string | null;
  tagRefs: string[];
  duplicateKey: string;
  duplicate: boolean;
};

type AccountCreation = {
  key: string;
  nome: string;
  saldoInicial: number;
};

type CardCreation = {
  key: string;
  nome: string;
  diaFechamento: number;
  diaVencimento: number;
  contaPagamentoRef: string | null;
  arquivado: boolean;
};

type CategoryCreation = {
  key: string;
  nome: string;
  tipo: "despesa" | "receita";
};

type TagCreation = {
  key: string;
  nome: string;
};

type IgnoredRow = {
  rowId: string;
  sheetName: string;
  sourceRow: number;
  reason: string;
};

type InvoiceSummary = {
  cartaoNome: string;
  faturaChave: string;
  totalCentavos: number;
  pagoCentavos: number;
  status: "confere" | "divergente" | "sem_pagamento";
};

type SpreadsheetPlan = {
  rows: PlannedRow[];
  ignored: IgnoredRow[];
  issues: SpreadsheetServerIssue[];
  pending: string[];
  warnings: string[];
  accountsToCreate: Map<string, AccountCreation>;
  cardsToCreate: Map<string, CardCreation>;
  categoriesToCreate: Map<string, CategoryCreation>;
  tagsToCreate: Map<string, TagCreation>;
  saldosIniciais: Map<string, number>;
  duplicateRowIds: string[];
  duplicateInsideFileRows: string[];
  invoices: InvoiceSummary[];
  counts: SpreadsheetPreviewCounts;
};

export type SpreadsheetPreviewCounts = {
  rows: number;
  importable: number;
  ignored: number;
  duplicates: number;
  zeros: number;
  byKind: { conta: number; cartao: number };
  byType: {
    despesa: number;
    receita: number;
    transferencia: number;
  };
  bySheet: Array<{
    sheetName: string;
    kind: "conta" | "cartao";
    rows: number;
    importable: number;
    ignored: number;
    duplicates: number;
    zeros: number;
  }>;
};

export type SpreadsheetPreviewResult =
  | {
      ok: true;
      counts: SpreadsheetPreviewCounts;
      issues: SpreadsheetServerIssue[];
      pending: string[];
      warnings: string[];
      duplicates: Array<{
        rowId: string;
        sheetName: string;
        sourceRow: number;
        origin: "banco" | "arquivo";
      }>;
      invoices: InvoiceSummary[];
      existingBatch: {
        id: string;
        fileName: string;
        createdAt: Date | number;
      } | null;
      requiresReimport: boolean;
      canImport: boolean;
    }
  | { ok: false; error: string };

export type SpreadsheetImportResult =
  | {
      ok: true;
      batchId: string;
      imported: number;
      ignored: number;
      duplicates: number;
      counts: SpreadsheetPreviewCounts;
      warnings: string[];
    }
  | { ok: false; error: string };

function fail(error: string) {
  return { ok: false as const, error };
}

const REF_ACCOUNT = "new:conta:";
const REF_CARD = "new:cartao:";
const REF_CATEGORY = "new:categoria:";
const REF_TAG = "new:tag:";

function accountRef(key: string) {
  return `${REF_ACCOUNT}${key}`;
}

function cardRef(key: string) {
  return `${REF_CARD}${key}`;
}

function categoryRef(key: string) {
  return `${REF_CATEGORY}${key}`;
}

function tagRef(key: string) {
  return `${REF_TAG}${key}`;
}

function addPending(pending: Set<string>, message: string) {
  pending.add(message);
}

type PreparedContext = {
  db: Db;
  workspaceId: string;
  input: SpreadsheetImportRequestInput;
  accountById: Map<string, { id: string; nome: string }>;
  accountByName: Map<string, { id: string; nome: string }>;
  cardById: Map<string, { id: string; nome: string; diaFechamento: number; diaVencimento: number; fechamentoCompra: "proxima_fatura" | "fatura_atual" }>;
  cardByName: Map<string, string>;
  categoryById: Map<string, { id: string; nome: string; tipo: "despesa" | "receita" }>;
  categoryByKey: Map<string, { id: string; nome: string; tipo: "despesa" | "receita" }>;
  tagById: Map<string, { id: string; nome: string }>;
  tagByName: Map<string, string>;
  accountTxCount: Map<string, number>;
  systemCategories: { despesa: string | null; receita: string | null };
};

function textValue(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function prepareContext(
  workspaceId: string,
  input: SpreadsheetImportRequestInput,
): PreparedContext {
  const { db, ws } = scopedDb(workspaceId);

  const accountRows = db
    .select({ id: accounts.id, nome: accounts.nome })
    .from(accounts)
    .where(and(ws(accounts.workspaceId), isNull(accounts.deletedAt)))
    .all();
  const cardRows = db
    .select({
      id: creditCards.id,
      nome: creditCards.nome,
      diaFechamento: creditCards.diaFechamento,
      diaVencimento: creditCards.diaVencimento,
      fechamentoCompra: creditCards.fechamentoCompra,
    })
    .from(creditCards)
    .where(and(ws(creditCards.workspaceId), isNull(creditCards.deletedAt)))
    .all();
  const categoryRows = db
    .select({
      id: categories.id,
      nome: categories.nome,
      tipo: categories.tipo,
    })
    .from(categories)
    .where(and(ws(categories.workspaceId), isNull(categories.deletedAt)))
    .all();
  const tagRows = db
    .select({ id: tags.id, nome: tags.nome })
    .from(tags)
    .where(ws(tags.workspaceId))
    .all();

  const accountTxRows = db
    .select({
      contaId: transactions.contaId,
      count: sql<number>`count(*)`,
    })
    .from(transactions)
    .where(
      and(
        ws(transactions.workspaceId),
        isNull(transactions.deletedAt),
        sql`${transactions.contaId} is not null`,
      ),
    )
    .groupBy(transactions.contaId)
    .all();

  return {
    db,
    workspaceId,
    input,
    accountById: new Map(accountRows.map((row) => [row.id, row])),
    accountByName: new Map(
      accountRows.map((row) => [normalizeEntityName(row.nome), row]),
    ),
    cardById: new Map(cardRows.map((row) => [row.id, row])),
    cardByName: new Map(
      cardRows.map((row) => [normalizeEntityName(row.nome), row.id]),
    ),
    categoryById: new Map(categoryRows.map((row) => [row.id, row])),
    categoryByKey: new Map(
      categoryRows.map((row) => [
        `${row.tipo}:${normalizeEntityName(row.nome)}`,
        row,
      ]),
    ),
    tagById: new Map(tagRows.map((row) => [row.id, row])),
    tagByName: new Map(
      tagRows.map((row) => [normalizeEntityName(row.nome), row.id]),
    ),
    accountTxCount: new Map(
      accountTxRows
        .filter((row): row is { contaId: string; count: number } =>
          Boolean(row.contaId),
        )
        .map((row) => [row.contaId, row.count]),
    ),
    systemCategories: getSystemCategoryIds(workspaceId),
  };
}

type OriginResolution = {
  ref: string;
  nome: string;
  kind: "conta" | "cartao";
};

function preparePlan(
  workspaceId: string,
  input: SpreadsheetImportRequestInput,
): SpreadsheetPlan {
  const context = prepareContext(workspaceId, input);
  const {
    accountById,
    accountByName,
    cardById,
    cardByName,
    categoryByKey,
    tagByName,
    accountTxCount,
    systemCategories,
  } = context;

  const accountsToCreate = new Map<string, AccountCreation>();
  const cardsToCreate = new Map<string, CardCreation>();
  const categoriesToCreate = new Map<string, CategoryCreation>();
  const tagsToCreate = new Map<string, TagCreation>();
  const saldosIniciais = new Map<string, number>();

  const pending = new Set<string>();
  const issues: SpreadsheetServerIssue[] = [];
  const warnings: string[] = [];
  const planned: PlannedRow[] = [];
  const ignored: IgnoredRow[] = [];

  const originDecisionBySheet = new Map(
    input.decisions.origins.map((origin) => [origin.sheetName, origin]),
  );
  const paymentsByRow = new Map(
    input.decisions.payments.map((payment) => [payment.rowId, payment]),
  );
  const investmentsByKey = new Map(
    input.decisions.investments.map((investment) => [
      investment.groupKey,
      investment,
    ]),
  );
  const saldosBySheet = new Map(
    input.decisions.saldosIniciais.map((saldo) => [saldo.sheetName, saldo]),
  );
  const carryOverByRow = new Map(
    input.decisions.carryOver.map((carry) => [carry.rowId, carry]),
  );
  const transfersByRow = new Map(
    input.decisions.transferencias.map((transfer) => [
      transfer.rowId,
      transfer,
    ]),
  );
  const categoryDecisionByKey = new Map(
    input.decisions.categories.map((category) => [category.key, category]),
  );
  const tagDecisionByKey = new Map(
    input.decisions.tags.map((tag) => [normalizeEntityName(tag.nome), tag]),
  );
  const ignoreRowIds = new Set(input.decisions.ignoreRowIds);

  const accountNameByRef = new Map<string, string>(
    [...accountById.values()].map((row) => [row.id, row.nome]),
  );
  const cardNameByRef = new Map<string, string>(
    [...cardById.values()].map((row) => [row.id, row.nome]),
  );
  const cardConfigByRef = new Map<string, CardCycleConfig>(
    [...cardById.values()].map((row) => [
      row.id,
      {
        diaFechamento: row.diaFechamento,
        diaVencimento: row.diaVencimento,
        fechamentoCompra: row.fechamentoCompra,
      },
    ]),
  );
  const originsBySheet = new Map<string, OriginResolution>();

  function ensureAccount(
    decision: SpreadsheetDecisionsInput["origins"][number],
    sheetName: string,
  ): string | null {
    if (decision.accountId) {
      const account = accountById.get(decision.accountId);
      if (!account) {
        addPending(pending, `A conta escolhida para a aba "${sheetName}" não existe.`);
        return null;
      }
      return account.id;
    }

    const name = textValue(decision.accountName) || sheetName;
    const key = normalizeEntityName(name);
    const existing = accountByName.get(key);
    if (existing) return existing.id;

    if (!decision.createAccount && !decision.accountName) {
      addPending(
        pending,
        `Escolha uma conta existente ou crie uma conta para a aba "${sheetName}".`,
      );
      return null;
    }

    const ref = accountRef(key);
    if (!accountsToCreate.has(key)) {
      accountsToCreate.set(key, {
        key,
        nome: name,
        saldoInicial: 0,
      });
    }
    accountNameByRef.set(ref, name);
    return ref;
  }

  function ensureCard(
    decision: SpreadsheetDecisionsInput["origins"][number],
    sheetName: string,
  ): string | null {
    if (decision.cardId) {
      const card = cardById.get(decision.cardId);
      if (!card) {
        addPending(pending, `O cartão escolhido para a aba "${sheetName}" não existe.`);
        return null;
      }
      return card.id;
    }

    const name = textValue(decision.cardName) || sheetName;
    const key = normalizeEntityName(name);
    const existing = cardByName.get(key);
    if (existing) return existing;

    if (!decision.createCard && !decision.cardName) {
      addPending(
        pending,
        `Escolha um cartão existente ou crie um cartão para a aba "${sheetName}".`,
      );
      return null;
    }

    const ref = cardRef(key);
    if (!cardsToCreate.has(key)) {
      const usedDefaults =
        decision.diaFechamento === undefined ||
        decision.diaVencimento === undefined;
      cardsToCreate.set(key, {
        key,
        nome: name,
        diaFechamento: decision.diaFechamento ?? 1,
        diaVencimento: decision.diaVencimento ?? 10,
        contaPagamentoRef: null,
        arquivado: false,
      });
      if (usedDefaults) {
        warnings.push(
          `Cartão "${name}" criado com fechamento 1 e vencimento 10 (valores padrão). Revise depois.`,
        );
      }
    }
    cardNameByRef.set(ref, name);
    cardByName.set(key, ref);
    cardConfigByRef.set(ref, {
      diaFechamento: decision.diaFechamento ?? 1,
      diaVencimento: decision.diaVencimento ?? 10,
      fechamentoCompra: "proxima_fatura",
    });
    return ref;
  }

  function resolveOrigin(sheetName: string): OriginResolution | null {
    const cached = originsBySheet.get(sheetName);
    if (cached) return cached;
    const decision = originDecisionBySheet.get(sheetName);
    if (!decision) {
      addPending(
        pending,
        `Defina a conta ou o cartão de destino da aba "${sheetName}".`,
      );
      return null;
    }

    const ref =
      decision.kind === "conta"
        ? ensureAccount(decision, sheetName)
        : ensureCard(decision, sheetName);
    if (!ref) return null;
    const nome =
      decision.kind === "conta"
        ? accountNameByRef.get(ref) ?? sheetName
        : cardNameByRef.get(ref) ?? sheetName;
    const origin: OriginResolution = { ref, nome, kind: decision.kind };
    originsBySheet.set(sheetName, origin);
    return origin;
  }

  // Resolve todas as origens antes das linhas para permitir o casamento
  // automático de pagamentos com cartões das abas.
  for (const sheetName of new Set(input.rows.map((row) => row.sheetName))) {
    resolveOrigin(sheetName);
  }

  function ensureHistoricalCard(
    name: string,
    decision: SpreadsheetDecisionsInput["payments"][number] | undefined,
    contaPagamentoRef: string | null,
  ): string | null {
    const normalized = normalizeEntityName(name);
    if (!normalized) return null;
    const existing = cardByName.get(normalized);
    if (existing) return existing;

    if (!decision?.createCard) {
      addPending(
        pending,
        `O cartão histórico "${name}" precisa ser criado, vinculado a um cartão existente ou tratado como despesa.`,
      );
      return null;
    }

    const ref = cardRef(normalized);
    if (!cardsToCreate.has(normalized)) {
      const usedDefaults =
        decision.diaFechamento === undefined ||
        decision.diaVencimento === undefined;
      cardsToCreate.set(normalized, {
        key: normalized,
        nome: name,
        diaFechamento: decision.diaFechamento ?? 1,
        diaVencimento: decision.diaVencimento ?? 10,
        contaPagamentoRef,
        arquivado: true,
      });
      if (usedDefaults) {
        warnings.push(
          `Cartão histórico "${name}" criado arquivado com fechamento 1 e vencimento 10 (valores padrão).`,
        );
      }
    } else if (!cardsToCreate.get(normalized)?.contaPagamentoRef) {
      const creation = cardsToCreate.get(normalized);
      if (creation) creation.contaPagamentoRef = contaPagamentoRef;
    }
    cardNameByRef.set(ref, name);
    cardByName.set(normalized, ref);
    cardConfigByRef.set(ref, {
      diaFechamento: decision.diaFechamento ?? 1,
      diaVencimento: decision.diaVencimento ?? 10,
      fechamentoCompra: "proxima_fatura",
    });
    return ref;
  }

  function resolveCategory(
    nome: string | null,
    tipo: "despesa" | "receita",
  ): string | null {
    const name = textValue(nome);
    if (!name) return systemCategories[tipo];

    const key = `${tipo}:${normalizeEntityName(name)}`;
    const decision = categoryDecisionByKey.get(key);
    if (decision) {
      if (decision.action === "ignorar") return null;
      if (decision.action === "existente") {
        const existing = decision.categoryId
          ? context.categoryById.get(decision.categoryId)
          : undefined;
        if (!existing) {
          addPending(
            pending,
            `A categoria escolhida para "${name}" (${tipo}) não existe.`,
          );
          return null;
        }
        if (existing.tipo !== tipo) {
          addPending(
            pending,
            `A categoria "${existing.nome}" é de ${existing.tipo}, mas a linha precisa de ${tipo}.`,
          );
          return null;
        }
        return existing.id;
      }

      const existing = categoryByKey.get(key);
      if (existing) return existing.id;
      const normalized = normalizeEntityName(name);
      if (!categoriesToCreate.has(key)) {
        categoriesToCreate.set(key, {
          key,
          nome: name,
          tipo,
        });
      }
      const ref = categoryRef(`${tipo}:${normalized}`);
      return ref;
    }

    const existing = categoryByKey.get(key);
    if (existing) return existing.id;

    addPending(
      pending,
      `A categoria "${name}" (${tipo}) precisa de decisão: usar existente, criar ou ignorar.`,
    );
    return null;
  }

  function resolveTag(nome: string): string | null {
    const name = textValue(nome);
    if (!name) return null;
    const key = normalizeEntityName(name);
    const decision = tagDecisionByKey.get(key);
    if (decision) {
      if (decision.action === "ignorar") return null;
      if (decision.action === "existente") {
        const existing = decision.tagId
          ? context.tagById.get(decision.tagId)
          : undefined;
        if (!existing) {
          addPending(pending, `A tag escolhida para "${name}" não existe.`);
          return null;
        }
        return existing.id;
      }
      const existing = tagByName.get(key);
      if (existing) return existing;
      if (!tagsToCreate.has(key)) {
        tagsToCreate.set(key, { key, nome: name });
      }
      return tagRef(key);
    }

    const existing = tagByName.get(key);
    if (existing) return existing;
    addPending(
      pending,
      `A tag "${name}" precisa de decisão: usar existente, criar ou ignorar.`,
    );
    return null;
  }

  function addRow(
    row: CanonicalSpreadsheetRowInput,
    data: Omit<
      PlannedRow,
      "rowId" | "sheetName" | "sourceRow" | "duplicateKey" | "duplicate"
    >,
  ) {
    const origemNome =
      (data.cartaoRef ? cardNameByRef.get(data.cartaoRef) : null) ??
      (data.contaRef ? accountNameByRef.get(data.contaRef) : null) ??
      row.origemNome;
    const duplicateKey = spreadsheetDuplicateKey({
      origemNome,
      data: row.data,
      valorCentavos: row.valorCentavos,
      descricao: row.descricao,
      parcelaAtual: row.parcelaAtual,
      parcelaTotal: row.parcelaTotal,
    });
    planned.push({
      rowId: row.id,
      sheetName: row.sheetName,
      sourceRow: row.sourceRow,
      duplicateKey,
      duplicate: false,
      ...data,
    });
  }

  function ignore(row: CanonicalSpreadsheetRowInput, reason: string) {
    ignored.push({
      rowId: row.id,
      sheetName: row.sheetName,
      sourceRow: row.sourceRow,
      reason,
    });
  }

  const duplicateInsideFileRows = new Set<string>();
  const fileDupes = new Map<string, string>();
  for (const row of input.rows) {
    const key = spreadsheetDuplicateKey({
      origemNome: row.origemNome,
      data: row.data,
      valorCentavos: row.valorCentavos,
      descricao: row.descricao,
      parcelaAtual: row.parcelaAtual,
      parcelaTotal: row.parcelaTotal,
    });
    if (fileDupes.has(key)) {
      duplicateInsideFileRows.add(row.id);
    } else {
      fileDupes.set(key, row.id);
    }
  }

  for (const row of input.rows) {
    if (ignoreRowIds.has(row.id)) {
      ignore(row, "Linha ignorada pelo usuário.");
      continue;
    }

    const origin = resolveOrigin(row.sheetName);
    if (!origin) {
      ignore(row, "Aba sem conta/cartão de destino.");
      continue;
    }

    const signedValue =
      row.tipo === "receita" ? row.valorCentavos : -row.valorCentavos;
    const specialKind = classifySpecialRow({
      descricao: row.descricao,
      categoriaNome: row.categoriaNome,
      valorCentavos: signedValue,
      sheetKind: origin.kind,
    });

    if (specialKind === "zero" || row.valorCentavos === 0) {
      ignore(row, "Valor zero.");
      continue;
    }

    const isPayment =
      specialKind === "pagamento_fatura" ||
      specialKind === "pagamento_positivo";

    if (isPayment) {
      const decision = paymentsByRow.get(row.id);
      if (decision?.action === "ignorar") {
        ignore(row, "Pagamento ignorado pelo usuário.");
        continue;
      }
      if (origin.kind !== "conta") {
        addPending(
          pending,
          `O pagamento da linha ${row.sourceRow} ("${row.sheetName}") precisa sair de uma conta.`,
        );
        ignore(row, "Pagamento em aba de cartão.");
        continue;
      }

      const parsed = parsePaymentDescription(row.descricao);
      const cardName =
        textValue(decision?.cardName) || row.cartaoNome || parsed.cardName;
      const positive =
        specialKind === "pagamento_positivo" || row.tipo === "receita";

      let cardRefValue: string | null = null;
      if (decision?.cardId) {
        const card = cardById.get(decision.cardId);
        if (!card) {
          addPending(pending, `O cartão do pagamento da linha ${row.sourceRow} não existe.`);
        } else {
          cardRefValue = card.id;
        }
      } else if (decision?.createCard && cardName) {
        cardRefValue = ensureHistoricalCard(cardName, decision, origin.ref);
      } else if (cardName) {
        cardRefValue = cardByName.get(normalizeEntityName(cardName)) ?? null;
        if (!cardRefValue) {
          addPending(
            pending,
            `O cartão "${cardName}" do pagamento da linha ${row.sourceRow} precisa de decisão.`,
          );
        }
      }

      if (positive) {
        if (!decision) {
          addPending(
            pending,
            `O pagamento positivo da linha ${row.sourceRow} precisa ser classificado como receita, despesa ou ignorado.`,
          );
          ignore(row, "Pagamento positivo sem decisão.");
          continue;
        }
        if (decision.action === "transferencia") {
          addPending(
            pending,
            `O pagamento positivo da linha ${row.sourceRow} não pode ser transferência para o cartão.`,
          );
          ignore(row, "Pagamento positivo como transferência.");
          continue;
        }
        addRow(row, {
          data: row.data,
          descricao: row.descricao,
          tipo: decision.action === "despesa" ? "despesa" : "receita",
          valor: row.valorCentavos,
          pago: row.pago,
          contaRef: origin.ref,
          cartaoRef: null,
          contaDestinoRef: null,
          cartaoDestinoRef: null,
          categoriaRef: null,
          faturaChave: null,
          faturaChaveOverride: null,
          observacao: row.observacao,
          parcelaAtual: row.parcelaAtual,
          parcelaTotal: row.parcelaTotal,
          parcelaGrupoId: row.parcelaGrupoId,
          tagRefs: row.tags
            .map((tag) => resolveTag(tag))
            .filter((tag): tag is string => Boolean(tag)),
        });
        continue;
      }

      const action = decision?.action ?? (cardRefValue ? "transferencia" : null);
      if (!action) {
        addPending(
          pending,
          `O pagamento da linha ${row.sourceRow} ("${row.descricao}") precisa ser conciliado.`,
        );
        ignore(row, "Pagamento sem conciliação.");
        continue;
      }

      if (action === "transferencia") {
        const faturaChave =
          decision?.faturaChave ?? parsed.faturaChave ?? row.faturaChave;
        if (!cardRefValue) {
          addPending(
            pending,
            `Escolha o cartão de destino do pagamento da linha ${row.sourceRow}.`,
          );
          ignore(row, "Pagamento sem cartão de destino.");
          continue;
        }
        if (!faturaChave) {
          addPending(
            pending,
            `Escolha o mês da fatura do pagamento da linha ${row.sourceRow}.`,
          );
          ignore(row, "Pagamento sem fatura.");
          continue;
        }
        const creation = cardsToCreate.get(
          cardRefValue.startsWith(REF_CARD)
            ? cardRefValue.slice(REF_CARD.length)
            : "",
        );
        if (creation && !creation.contaPagamentoRef) {
          creation.contaPagamentoRef = origin.ref;
        }
        addRow(row, {
          data: row.data,
          descricao: row.descricao,
          tipo: "transferencia",
          valor: row.valorCentavos,
          pago: row.pago,
          contaRef: origin.ref,
          cartaoRef: null,
          contaDestinoRef: null,
          cartaoDestinoRef: cardRefValue,
          categoriaRef: null,
          faturaChave,
          faturaChaveOverride: null,
          observacao: row.observacao,
          parcelaAtual: null,
          parcelaTotal: null,
          parcelaGrupoId: null,
          tagRefs: [],
        });
        continue;
      }

      addRow(row, {
        data: row.data,
        descricao: row.descricao,
        tipo: action === "receita" ? "receita" : "despesa",
        valor: row.valorCentavos,
        pago: row.pago,
        contaRef: origin.ref,
        cartaoRef: null,
        contaDestinoRef: null,
        cartaoDestinoRef: null,
        categoriaRef: null,
        faturaChave: null,
        faturaChaveOverride: null,
        observacao: row.observacao,
        parcelaAtual: null,
        parcelaTotal: null,
        parcelaGrupoId: null,
        tagRefs: [],
      });
      continue;
    }

    if (specialKind === "saldo_inicial") {
      if (origin.kind !== "conta") {
        addPending(
          pending,
          `O saldo inicial da aba "${row.sheetName}" precisa estar em uma conta.`,
        );
        ignore(row, "Saldo inicial em cartão.");
        continue;
      }
      const decision = saldosBySheet.get(row.sheetName);
      const hasTransactions = (accountTxCount.get(origin.ref) ?? 0) > 0;
      const isNew = origin.ref.startsWith(REF_ACCOUNT);
      const action =
        decision?.action ??
        (isNew || !hasTransactions ? "saldo_inicial" : "ajuste");

      if (action === "ignorar") {
        ignore(row, "Saldo inicial ignorado.");
        continue;
      }
      if (action === "saldo_inicial") {
        if (!isNew && hasTransactions) {
          addPending(
            pending,
            `A conta "${origin.nome}" já tem lançamentos. Escolha ajuste ou ignorar para o saldo inicial.`,
          );
          ignore(row, "Saldo inicial sem decisão válida.");
          continue;
        }
        const signed =
          row.tipo === "receita" ? row.valorCentavos : -row.valorCentavos;
        saldosIniciais.set(
          origin.ref,
          (saldosIniciais.get(origin.ref) ?? 0) + signed,
        );
        const creationKey = origin.ref.startsWith(REF_ACCOUNT)
          ? origin.ref.slice(REF_ACCOUNT.length)
          : null;
        const creation = creationKey
          ? accountsToCreate.get(creationKey)
          : undefined;
        if (creation) {
          creation.saldoInicial += signed;
        }
        ignore(row, "Aplicado como saldo inicial da conta.");
        continue;
      }

      addRow(row, {
        data: row.data,
        descricao: row.descricao,
        tipo: row.tipo === "receita" ? "receita" : "despesa",
        valor: row.valorCentavos,
        pago: true,
        contaRef: origin.ref,
        cartaoRef: null,
        contaDestinoRef: null,
        cartaoDestinoRef: null,
        categoriaRef: resolveCategory(
          row.categoriaNome ?? "Outras receitas",
          row.tipo === "receita" ? "receita" : "despesa",
        ),
        faturaChave: null,
        faturaChaveOverride: null,
        observacao: row.observacao ?? "Saldo inicial importado.",
        parcelaAtual: null,
        parcelaTotal: null,
        parcelaGrupoId: null,
        tagRefs: row.tags
          .map((tag) => resolveTag(tag))
          .filter((tag): tag is string => Boolean(tag)),
      });
      continue;
    }

    if (specialKind === "investimento") {
      const groupKey = investmentGroupKey(row);
      const decision = investmentsByKey.get(groupKey);
      const action = decision?.action ?? "despesa";
      if (action === "ignorar") {
        ignore(row, "Investimento/reserva ignorado.");
        continue;
      }

      if (action === "transferencia") {
        if (origin.kind !== "conta") {
          addPending(
            pending,
            `O investimento da linha ${row.sourceRow} ("${row.sheetName}") está em um cartão e não pode ser transferência entre contas.`,
          );
          ignore(row, "Investimento em cartão como transferência.");
          continue;
        }
        const destination = decision?.contaDestinoId
          ? accountById.get(decision.contaDestinoId)
          : null;
        if (!destination) {
          addPending(
            pending,
            `Escolha a conta de destino do investimento/reserva "${row.descricao}" (linha ${row.sourceRow}).`,
          );
          ignore(row, "Investimento sem conta de destino.");
          continue;
        }
        addRow(row, {
          data: row.data,
          descricao: row.descricao,
          tipo: "transferencia",
          valor: row.valorCentavos,
          pago: row.pago,
          contaRef: row.tipo === "receita" ? destination.id : origin.ref,
          cartaoRef: null,
          contaDestinoRef: row.tipo === "receita" ? origin.ref : destination.id,
          cartaoDestinoRef: null,
          categoriaRef: null,
          faturaChave: null,
          faturaChaveOverride: null,
          observacao: row.observacao,
          parcelaAtual: row.parcelaAtual,
          parcelaTotal: row.parcelaTotal,
          parcelaGrupoId: row.parcelaGrupoId,
          tagRefs: row.tags
            .map((tag) => resolveTag(tag))
            .filter((tag): tag is string => Boolean(tag)),
        });
        continue;
      }

      const tipo: "despesa" | "receita" =
        row.tipo === "receita" ? "receita" : "despesa";
      let categoria: string | null = null;
      if (decision?.categoriaId) {
        const existing = context.categoryById.get(decision.categoriaId);
        if (!existing) {
          addPending(
            pending,
            `A categoria escolhida para o investimento da linha ${row.sourceRow} não existe.`,
          );
        } else {
          categoria = existing.id;
        }
      }
      if (!categoria) {
        categoria = resolveCategory("Investimentos", tipo);
      }

      if (origin.kind === "cartao") {
        addRow(row, {
          data: row.data,
          descricao: row.descricao,
          tipo,
          valor: row.valorCentavos,
          pago: false,
          contaRef: null,
          cartaoRef: origin.ref,
          contaDestinoRef: null,
          cartaoDestinoRef: null,
          categoriaRef: categoria,
          faturaChave: null,
          faturaChaveOverride: row.faturaChave,
          observacao: row.observacao,
          parcelaAtual: row.parcelaAtual,
          parcelaTotal: row.parcelaTotal,
          parcelaGrupoId: row.parcelaGrupoId,
          tagRefs: row.tags
            .map((tag) => resolveTag(tag))
            .filter((tag): tag is string => Boolean(tag)),
        });
        continue;
      }

      addRow(row, {
        data: row.data,
        descricao: row.descricao,
        tipo,
        valor: row.valorCentavos,
        pago: row.pago,
        contaRef: origin.ref,
        cartaoRef: null,
        contaDestinoRef: null,
        cartaoDestinoRef: null,
        categoriaRef: categoria,
        faturaChave: null,
        faturaChaveOverride: null,
        observacao: row.observacao,
        parcelaAtual: row.parcelaAtual,
        parcelaTotal: row.parcelaTotal,
        parcelaGrupoId: row.parcelaGrupoId,
        tagRefs: row.tags
          .map((tag) => resolveTag(tag))
          .filter((tag): tag is string => Boolean(tag)),
      });
      continue;
    }

    if (
      specialKind === "carry_over" ||
      specialKind === "cartao_adicional"
    ) {
      const decision = carryOverByRow.get(row.id);
      if (!decision || decision.action === "ignorar") {
        ignore(row, "Carry-over/saldo anterior ignorado.");
        continue;
      }
      const cardRefValue = decision.cartaoId
        ? cardById.get(decision.cartaoId)?.id ?? null
        : origin.kind === "cartao"
          ? origin.ref
          : null;
      if (!cardRefValue) {
        addPending(
          pending,
          `Escolha o cartão de destino da linha ${row.sourceRow} ("${row.descricao}").`,
        );
        ignore(row, "Carry-over sem cartão.");
        continue;
      }
      addRow(row, {
        data: row.data,
        descricao: row.descricao,
        tipo: row.tipo === "receita" ? "receita" : "despesa",
        valor: row.valorCentavos,
        pago: false,
        contaRef: null,
        cartaoRef: cardRefValue,
        contaDestinoRef: null,
        cartaoDestinoRef: null,
        categoriaRef: resolveCategory(
          row.categoriaNome,
          row.tipo === "receita" ? "receita" : "despesa",
        ),
        faturaChave: null,
        faturaChaveOverride: row.faturaChave,
        observacao: row.observacao,
        parcelaAtual: null,
        parcelaTotal: null,
        parcelaGrupoId: null,
        tagRefs: row.tags
          .map((tag) => resolveTag(tag))
          .filter((tag): tag is string => Boolean(tag)),
      });
      continue;
    }

    if (specialKind === "transferencia") {
      const decision = transfersByRow.get(row.id);
      if (decision?.action === "ignorar") {
        ignore(row, "Transferência ignorada.");
        continue;
      }
      if (decision?.action === "transferencia") {
        const destination = decision.contaDestinoId
          ? accountById.get(decision.contaDestinoId)
          : null;
        if (!destination) {
          addPending(
            pending,
            `Escolha a conta de destino da transferência da linha ${row.sourceRow}.`,
          );
          ignore(row, "Transferência sem destino.");
          continue;
        }
        addRow(row, {
          data: row.data,
          descricao: row.descricao,
          tipo: "transferencia",
          valor: row.valorCentavos,
          pago: row.pago,
          contaRef:
            row.tipo === "receita"
              ? destination.id
              : origin.kind === "conta"
                ? origin.ref
                : null,
          cartaoRef: null,
          contaDestinoRef:
            row.tipo === "receita" ? origin.ref : destination.id,
          cartaoDestinoRef: null,
          categoriaRef: null,
          faturaChave: null,
          faturaChaveOverride: null,
          observacao: row.observacao,
          parcelaAtual: null,
          parcelaTotal: null,
          parcelaGrupoId: null,
          tagRefs: [],
        });
        continue;
      }
      // Sem decisão explícita, segue o sinal como lançamento comum.
      // A UI apresenta a escolha de transferência entre contas.
      if (origin.kind === "conta") {
        const tipo: "despesa" | "receita" =
          decision?.action === "receita"
            ? "receita"
            : decision?.action === "despesa"
              ? "despesa"
              : row.tipo === "receita"
                ? "receita"
                : "despesa";
        addRow(row, {
          data: row.data,
          descricao: row.descricao,
          tipo,
          valor: row.valorCentavos,
          pago: row.pago,
          contaRef: origin.ref,
          cartaoRef: null,
          contaDestinoRef: null,
          cartaoDestinoRef: null,
          categoriaRef: resolveCategory(row.categoriaNome, tipo),
          faturaChave: null,
          faturaChaveOverride: null,
          observacao: row.observacao,
          parcelaAtual: row.parcelaAtual,
          parcelaTotal: row.parcelaTotal,
          parcelaGrupoId: row.parcelaGrupoId,
          tagRefs: row.tags
            .map((tag) => resolveTag(tag))
            .filter((tag): tag is string => Boolean(tag)),
        });
      }
      continue;
    }

    // Linha comum: compra/venda na conta ou compra no cartão.
    const tipo: "despesa" | "receita" =
      row.tipo === "receita" ? "receita" : "despesa";
    if (origin.kind === "cartao") {
      addRow(row, {
        data: row.data,
        descricao: row.descricao,
        tipo,
        valor: row.valorCentavos,
        pago: false,
        contaRef: null,
        cartaoRef: origin.ref,
        contaDestinoRef: null,
        cartaoDestinoRef: null,
        categoriaRef: resolveCategory(row.categoriaNome, tipo),
        faturaChave: null,
        faturaChaveOverride: row.faturaChave,
        observacao: row.observacao,
        parcelaAtual: row.parcelaAtual,
        parcelaTotal: row.parcelaTotal,
        parcelaGrupoId: row.parcelaGrupoId,
        tagRefs: row.tags
          .map((tag) => resolveTag(tag))
          .filter((tag): tag is string => Boolean(tag)),
      });
    } else {
      addRow(row, {
        data: row.data,
        descricao: row.descricao,
        tipo,
        valor: row.valorCentavos,
        pago: row.pago,
        contaRef: origin.ref,
        cartaoRef: null,
        contaDestinoRef: null,
        cartaoDestinoRef: null,
        categoriaRef: resolveCategory(row.categoriaNome, tipo),
        faturaChave: null,
        faturaChaveOverride: null,
        observacao: row.observacao,
        parcelaAtual: row.parcelaAtual,
        parcelaTotal: row.parcelaTotal,
        parcelaGrupoId: row.parcelaGrupoId,
        tagRefs: row.tags
          .map((tag) => resolveTag(tag))
          .filter((tag): tag is string => Boolean(tag)),
      });
    }
  }

  // Duplicados contra o banco: origem + data + valor + descrição + parcela.
  const duplicateRowIds = new Set<string>();
  const dates = [...new Set(planned.map((row) => row.data))];
  const existing: Array<{
    data: string;
    valor: number;
    descricao: string;
    contaId: string | null;
    cartaoId: string | null;
    parcelaAtual: number | null;
    parcelaTotal: number | null;
  }> = [];
  for (let index = 0; index < dates.length; index += 400) {
    const chunk = dates.slice(index, index + 400);
    if (chunk.length === 0) continue;
    existing.push(
      ...context.db
        .select({
          data: transactions.data,
          valor: transactions.valor,
          descricao: transactions.descricao,
          contaId: transactions.contaId,
          cartaoId: transactions.cartaoId,
          parcelaAtual: transactions.parcelaAtual,
          parcelaTotal: transactions.parcelaTotal,
        })
        .from(transactions)
        .where(
          and(
            eq(transactions.workspaceId, workspaceId),
            isNull(transactions.deletedAt),
            inArray(transactions.data, chunk),
          ),
        )
        .all(),
    );
  }

  const accountNameById = new Map(
    [...accountNameByRef.entries()].filter(([ref]) =>
      context.accountById.has(ref),
    ),
  );
  const cardNameById = new Map(
    [...cardNameByRef.entries()].filter(([ref]) => context.cardById.has(ref)),
  );
  const existingKeys = new Set(
    existing.map((row) =>
      spreadsheetDuplicateKey({
        origemNome:
          (row.contaId ? accountNameById.get(row.contaId) : null) ??
          (row.cartaoId ? cardNameById.get(row.cartaoId) : null) ??
          "",
        data: row.data,
        valorCentavos: row.valor,
        descricao: row.descricao,
        parcelaAtual: row.parcelaAtual,
        parcelaTotal: row.parcelaTotal,
      }),
    ),
  );

  for (const row of planned) {
    if (existingKeys.has(row.duplicateKey)) {
      row.duplicate = true;
      duplicateRowIds.add(row.rowId);
    }
  }

  if (input.decisions.ignoreDuplicateRows) {
    for (let index = planned.length - 1; index >= 0; index -= 1) {
      const row = planned[index];
      if (!row?.duplicate) continue;
      planned.splice(index, 1);
      ignored.push({
        rowId: row.rowId,
        sheetName: row.sheetName,
        sourceRow: row.sourceRow,
        reason: "Duplicado suspeito (já existe no banco).",
      });
    }
  }

  // Totais por fatura: compras (respeitando o override) menos estornos,
  // comparados com os pagamentos vinculados.
  const invoiceMap = new Map<
    string,
    {
      cartaoRef: string;
      faturaChave: string;
      total: number;
      pago: number;
    }
  >();
  function invoiceBucket(cartaoRefValue: string, chave: string) {
    const key = `${cartaoRefValue}|${chave}`;
    const current = invoiceMap.get(key) ?? {
      cartaoRef: cartaoRefValue,
      faturaChave: chave,
      total: 0,
      pago: 0,
    };
    invoiceMap.set(key, current);
    return current;
  }

  for (const row of planned) {
    if (row.tipo === "transferencia") {
      if (row.cartaoDestinoRef && row.faturaChave && row.pago) {
        invoiceBucket(row.cartaoDestinoRef, row.faturaChave).pago += row.valor;
      }
      continue;
    }
    if (!row.cartaoRef) continue;
    const config = cardConfigByRef.get(row.cartaoRef);
    if (!config) continue;
    const chave =
      row.faturaChaveOverride ?? faturaDaCompra(row.data, config);
    const bucket = invoiceBucket(row.cartaoRef, chave);
    bucket.total += row.tipo === "despesa" ? row.valor : -row.valor;
  }

  const invoices: InvoiceSummary[] = [...invoiceMap.values()]
    .map((bucket) => {
      const total = bucket.total;
      const pago = bucket.pago;
      const status: InvoiceSummary["status"] =
        pago === 0
          ? "sem_pagamento"
          : pago === total
            ? "confere"
            : "divergente";
      if (status === "divergente") {
        warnings.push(
          `A fatura ${bucket.faturaChave} de "${cardNameByRef.get(bucket.cartaoRef) ?? "cartão"}" soma ${formatCurrency(total)}, mas os pagamentos somam ${formatCurrency(pago)}.`,
        );
      }
      return {
        cartaoNome:
          cardNameByRef.get(bucket.cartaoRef) ??
          bucket.cartaoRef,
        faturaChave: bucket.faturaChave,
        totalCentavos: total,
        pagoCentavos: pago,
        status,
      };
    })
    .sort(
      (a, b) =>
        a.faturaChave.localeCompare(b.faturaChave) ||
        a.cartaoNome.localeCompare(b.cartaoNome),
    );

  const byKind = { conta: 0, cartao: 0 };
  const byType = { despesa: 0, receita: 0, transferencia: 0 };
  const rowsBySheet = new Map<
    string,
    { rows: number; importable: number; ignored: number; duplicates: number; zeros: number; kind: "conta" | "cartao" }
  >();
  for (const row of input.rows) {
    byKind[row.sheetKind] += 1;
    const current = rowsBySheet.get(row.sheetName) ?? {
      rows: 0,
      importable: 0,
      ignored: 0,
      duplicates: 0,
      zeros: 0,
      kind: row.sheetKind,
    };
    current.rows += 1;
    if (row.specialKind === "zero") current.zeros += 1;
    rowsBySheet.set(row.sheetName, current);
  }
  for (const row of planned) {
    byType[row.tipo] += 1;
    const current = rowsBySheet.get(row.sheetName);
    if (current) current.importable += 1;
  }
  for (const row of ignored) {
    const current = rowsBySheet.get(row.sheetName);
    if (current) current.ignored += 1;
  }
  for (const rowId of duplicateRowIds) {
    const row = input.rows.find((item) => item.id === rowId);
    const current = row ? rowsBySheet.get(row.sheetName) : undefined;
    if (current) current.duplicates += 1;
  }

  const counts: SpreadsheetPreviewCounts = {
    rows: input.rows.length,
    importable: planned.length,
    ignored: ignored.length,
    duplicates: duplicateRowIds.size,
    zeros: input.rows.filter((row) => row.specialKind === "zero").length,
    byKind,
    byType,
    bySheet: [...rowsBySheet.entries()].map(([sheetName, value]) => ({
      sheetName,
      ...value,
    })),
  };

  for (const row of input.rows) {
    for (const message of row.warnings) {
      warnings.push(`${row.sheetName} · linha ${row.sourceRow}: ${message}`);
    }
  }

  return {
    rows: planned,
    ignored,
    issues,
    pending: [...pending],
    warnings: [...new Set(warnings)],
    accountsToCreate,
    cardsToCreate,
    categoriesToCreate,
    tagsToCreate,
    saldosIniciais,
    duplicateRowIds: [...duplicateRowIds],
    duplicateInsideFileRows: [...duplicateInsideFileRows],
    invoices,
    counts,
  };
}

function previewFromPlan(
  plan: SpreadsheetPlan,
  existingBatch: ReturnType<typeof findImportBatchByHash>,
  reimportarHash: boolean,
  inputRows: CanonicalSpreadsheetRowInput[],
): SpreadsheetPreviewResult {
  const duplicates = [
    ...plan.duplicateRowIds.map((rowId) => {
      const row = inputRows.find((item) => item.id === rowId);
      return {
        rowId,
        sheetName: row?.sheetName ?? "",
        sourceRow: row?.sourceRow ?? 0,
        origin: "banco" as const,
      };
    }),
    ...plan.duplicateInsideFileRows.map((rowId) => {
      const row = inputRows.find((item) => item.id === rowId);
      return {
        rowId,
        sheetName: row?.sheetName ?? "",
        sourceRow: row?.sourceRow ?? 0,
        origin: "arquivo" as const,
      };
    }),
  ];
  const requiresReimport = Boolean(existingBatch) && !reimportarHash;
  return {
    ok: true,
    counts: plan.counts,
    issues: plan.issues,
    pending: plan.pending,
    warnings: plan.warnings,
    duplicates,
    invoices: plan.invoices,
    existingBatch: existingBatch
      ? {
          id: existingBatch.id,
          fileName: existingBatch.fileName,
          createdAt: existingBatch.createdAt,
        }
      : null,
    requiresReimport,
    canImport:
      plan.rows.length > 0 &&
      plan.pending.length === 0 &&
      !requiresReimport,
  };
}

export async function previewSpreadsheetImportAction(
  input: SpreadsheetImportRequestInput,
): Promise<SpreadsheetPreviewResult> {
  const user = await requireUser();
  const parsed = spreadsheetImportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const plan = preparePlan(user.workspaceId, parsed.data);
  const existingBatch = findImportBatchByHash(
    user.workspaceId,
    parsed.data.fileHash,
  );
  return previewFromPlan(
    plan,
    existingBatch,
    parsed.data.decisions.reimportarHash ?? false,
    parsed.data.rows,
  );
}

export async function importSpreadsheetImportAction(
  input: SpreadsheetImportRequestInput,
): Promise<SpreadsheetImportResult> {
  const user = await requireUser();
  const workspaceId = user.workspaceId;
  const parsed = spreadsheetImportRequestSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const plan = preparePlan(workspaceId, parsed.data);
  if (plan.pending.length > 0) {
    return fail(
      `Resolva as pendências antes de importar: ${plan.pending
        .slice(0, 3)
        .join(" ")}`,
    );
  }
  if (plan.rows.length === 0) {
    return fail("Nenhuma linha válida para importar.");
  }

  const existingBatch = findImportBatchByHash(
    workspaceId,
    parsed.data.fileHash,
  );
  if (existingBatch && !parsed.data.decisions.reimportarHash) {
    return fail(
      `Este arquivo já foi importado em ${new Date(existingBatch.createdAt).toLocaleString("pt-BR")}. Marque a opção de reimportar para continuar.`,
    );
  }

  const { db } = scopedDb(workspaceId);
  const batchId = crypto.randomUUID();
  const now = new Date();

  const counts: ImportBatchCounts = {
    total: parsed.data.rows.length,
    imported: plan.rows.length,
    ignored: plan.ignored.length,
    duplicates: plan.duplicateRowIds.length,
    invalid: 0,
    byKind: plan.counts.byKind,
    byType: plan.counts.byType,
  };

  try {
    db.transaction((tx) => {
      const accountIds = new Map<string, string>();
      const cardIds = new Map<string, string>();
      const categoryIds = new Map<string, string>();
      const tagIds = new Map<string, string>();
      const involvedCardIds = new Set<string>();

      // Reaproveita os IDs existentes carregados no contexto do plano.
      for (const creation of plan.accountsToCreate.values()) {
        const id = crypto.randomUUID();
        tx.insert(accounts)
          .values({
            id,
            workspaceId,
            nome: creation.nome,
            tipo: "corrente",
            saldoInicial: creation.saldoInicial,
            cor: "#34d399",
            icone: "Wallet",
            arquivada: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        accountIds.set(accountRef(creation.key), id);
      }

      for (const creation of plan.cardsToCreate.values()) {
        const id = crypto.randomUUID();
        const contaPagamentoId = creation.contaPagamentoRef
          ? resolveRef(creation.contaPagamentoRef, accountIds)
          : null;
        tx.insert(creditCards)
          .values({
            id,
            workspaceId,
            nome: creation.nome,
            bandeira: "outra",
            limite: 0,
            diaFechamento: creation.diaFechamento,
            diaVencimento: creation.diaVencimento,
            fechamentoCompra: "proxima_fatura",
            contaPagamentoId,
            cor: "#818cf8",
            icone: "CreditCard",
            arquivado: creation.arquivado,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        cardIds.set(cardRef(creation.key), id);
        involvedCardIds.add(id);
      }

      for (const creation of plan.categoriesToCreate.values()) {
        const id = crypto.randomUUID();
        tx.insert(categories)
          .values({
            id,
            workspaceId,
            nome: creation.nome,
            tipo: creation.tipo,
            icone:
              creation.tipo === "despesa" ? "CircleEllipsis" : "CirclePlus",
            cor: "#94a3b8",
            isSystem: false,
            createdAt: now,
            updatedAt: now,
          })
          .run();
        categoryIds.set(categoryRef(creation.key), id);
      }

      for (const creation of plan.tagsToCreate.values()) {
        const id = crypto.randomUUID();
        tx.insert(tags)
          .values({ id, workspaceId, nome: creation.nome })
          .run();
        tagIds.set(tagRef(creation.key), id);
      }

      for (const [ref, saldo] of plan.saldosIniciais) {
        if (ref.startsWith(REF_ACCOUNT)) continue;
        tx.update(accounts)
          .set({ saldoInicial: saldo, updatedAt: now })
          .where(and(eq(accounts.id, ref), eq(accounts.workspaceId, workspaceId)))
          .run();
      }

      let imported = 0;
      for (const row of plan.rows) {
        const id = crypto.randomUUID();
        const contaId = row.contaRef
          ? resolveRef(row.contaRef, accountIds)
          : null;
        const cartaoId = row.cartaoRef
          ? resolveRef(row.cartaoRef, cardIds)
          : null;
        const contaDestinoId = row.contaDestinoRef
          ? resolveRef(row.contaDestinoRef, accountIds)
          : null;
        const cartaoDestinoId = row.cartaoDestinoRef
          ? resolveRef(row.cartaoDestinoRef, cardIds)
          : null;
        const categoriaId = row.categoriaRef
          ? resolveRef(row.categoriaRef, categoryIds)
          : null;

        if (cartaoId) involvedCardIds.add(cartaoId);
        if (cartaoDestinoId) involvedCardIds.add(cartaoDestinoId);

        tx.insert(transactions)
          .values({
            id,
            workspaceId,
            tipo: row.tipo,
            descricao: row.descricao,
            valor: row.valor,
            data: row.data,
            pago: row.pago,
            contaId,
            cartaoId,
            contaDestinoId,
            cartaoDestinoId,
            faturaChave: row.faturaChave,
            faturaChaveOverride: row.faturaChaveOverride,
            categoriaId,
            observacao: row.observacao,
            parcelaAtual: row.parcelaAtual,
            parcelaTotal: row.parcelaTotal,
            parcelaGrupoId: row.parcelaGrupoId,
            importBatchId: batchId,
            createdAt: now,
            updatedAt: now,
          })
          .run();

        for (const ref of row.tagRefs) {
          const tagId = resolveRef(ref, tagIds);
          if (!tagId) continue;
          tx.insert(transactionTags)
            .values({ workspaceId, transactionId: id, tagId })
            .onConflictDoNothing()
            .run();
        }
        imported += 1;
      }

      if (parsed.data.decisions.considerarFaturasPagasAte) {
        const ids = [...involvedCardIds];
        if (ids.length > 0) {
          tx.update(creditCards)
            .set({
              faturasPagasAte: parsed.data.decisions.considerarFaturasPagasAte,
              updatedAt: now,
            })
            .where(
              and(
                eq(creditCards.workspaceId, workspaceId),
                inArray(creditCards.id, ids),
              ),
            )
            .run();
        }
      }

      tx.insert(importBatches)
        .values({
          id: batchId,
          workspaceId,
          fileName: parsed.data.fileName,
          fileHash: parsed.data.fileHash.toLowerCase(),
          importedById: user.id,
          counts,
          createdAt: now,
        })
        .run();

      if (imported !== plan.rows.length) {
        throw new Error("Nem todos os lançamentos foram inseridos.");
      }
    });
  } catch (error) {
    console.error("[verde] erro ao importar planilha:", error);
    return fail(
      error instanceof Error
        ? `Não foi possível importar a planilha: ${error.message}`
        : "Não foi possível importar a planilha.",
    );
  }

  revalidateAfterDataChange();
  return {
    ok: true,
    batchId,
    imported: plan.rows.length,
    ignored: plan.ignored.length,
    duplicates: plan.duplicateRowIds.length,
    counts: plan.counts,
    warnings: plan.warnings,
  };
}

/** Resolve uma referência existente (UUID) ou criada no lote. */
function resolveRef(
  ref: string,
  created: Map<string, string>,
): string | null {
  if (
    ref.startsWith(REF_ACCOUNT) ||
    ref.startsWith(REF_CARD) ||
    ref.startsWith(REF_CATEGORY) ||
    ref.startsWith(REF_TAG)
  ) {
    return created.get(ref) ?? null;
  }
  return ref;
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
