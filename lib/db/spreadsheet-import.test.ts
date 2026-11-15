import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import {
  createTestDatabase,
  createWorkspaceUser,
  installTestDatabase,
  resetTestDatabase,
  type TestDatabase,
  type TestUser,
} from "./testing";
import {
  accounts,
  categories,
  creditCards,
  importBatches,
  tags,
  transactionTags,
  transactions,
  users,
  type User,
} from "./schema";
import {
  importSpreadsheetImportAction,
  previewSpreadsheetImportAction,
} from "@/lib/actions/spreadsheet-import";
import { undoLastImportAction } from "@/lib/actions/data";
import {
  analyzeSpreadsheet,
  type SpreadsheetSheet,
} from "@/lib/finance/spreadsheet-import";
import type { SpreadsheetImportRequestInput } from "@/lib/validation/import";
import { getCardInvoiceDetail, listCardInvoiceEventsForMonth } from "./queries/cards";
import type { CardInvoiceFilters } from "@/lib/finance/cards";
import { getLatestImportBatch } from "./queries/data-export";

const state = vi.hoisted(() => ({ user: null as User | null }));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: async () => state.user,
  requireUser: async () => {
    if (!state.user) throw new Error("sem usuário");
    return state.user;
  },
  requireSessionUser: async () => state.user,
  requireAdmin: async () => state.user,
}));

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
}));

const HASH = "a".repeat(64);

const FILTERS: CardInvoiceFilters = {
  tipo: null,
  cartoes: [],
  contas: [],
  categorias: [],
  tags: [],
  status: "todos",
  q: null,
};

const SHEETS: SpreadsheetSheet[] = [
  {
    name: "Conta",
    headers: [
      "Data",
      "Descrição",
      "Categoria",
      "Valor",
      "Situação",
      "Tags",
      "Informações adicionais",
    ],
    rows: [
      [
        "01.08.2022",
        "Saldo Inicial",
        "Outras receitas",
        685.94,
        "Pago",
        "",
        "",
      ],
      ["02.08.2022", "Investimentos", "Investimentos", -400, "Pago", "", ""],
      [
        "03.08.2022",
        "Pagamento de fatura - Cartão Teste - Setembro de 2022",
        "Pagamento de fatura",
        -50,
        "Pago",
        "",
        "",
      ],
      [
        "04.08.2022",
        "Pagamento de fatura - Carbono - Agosto de 2022",
        "Pagamento de fatura",
        -30,
        "Pago",
        "",
        "",
      ],
      [
        "05.08.2022",
        "Compra mercado",
        "Compras",
        -50,
        "Pago",
        "juntando",
        "Primeira linha\nSegunda linha",
      ],
      ["06.08.2022", "Linha zero", "Outros", 0, "Pago", "", ""],
      ["07.08.2022", "Correção de saldo", "Outros", -5, "Pago", "", ""],
      ["08.08.2022", "Compra no débito", "Compras", -20, "Pago", "", ""],
    ],
  },
  {
    name: "Cartão",
    headers: [
      "Data",
      "Descrição",
      "Categoria",
      "Valor",
      "Fatura",
      "Tags",
      "Informações adicionais",
    ],
    rows: [
      [
        "15.07.2022",
        "Compra cartão",
        "Compras",
        -100,
        "Outubro/2022",
        "",
        "",
      ],
      [
        "16.07.2022",
        "Sky Team 4/4",
        "Compras",
        -50,
        "Setembro/2022",
        "",
        "",
      ],
      [
        "17.07.2022",
        "FATURA C6 // MES 07",
        "Outros",
        -30,
        "Agosto/2022",
        "",
        "",
      ],
      [
        "18.07.2022",
        "Estorno",
        "Outras receitas",
        20,
        "Outubro/2022",
        "",
        "",
      ],
    ],
  },
];

let testDb: TestDatabase;
let user: TestUser;

function setCurrent(target: TestUser | null) {
  state.user = target
    ? (testDb.db.select().from(users).where(eq(users.id, target.id)).get() ??
      null)
    : null;
}

function buildRequest(): SpreadsheetImportRequestInput {
  const analysis = analyzeSpreadsheet(SHEETS);
  const paymentRows = analysis.rows.filter(
    (row) =>
      row.specialKind === "pagamento_fatura" ||
      row.specialKind === "pagamento_positivo",
  );

  return {
    fileName: "fixture.xlsx",
    fileHash: HASH,
    rows: analysis.rows,
    decisions: {
      origins: [
        {
          sheetName: "Conta",
          kind: "conta",
          accountName: "Conta Teste",
          createAccount: true,
        },
        {
          sheetName: "Cartão",
          kind: "cartao",
          cardName: "Cartão Teste",
          createCard: true,
          diaFechamento: 10,
          diaVencimento: 17,
        },
      ],
      categories: analysis.categories.map((category) => ({
        key: category.key,
        tipo: category.tipo,
        action: "criar" as const,
        nome: category.nome,
      })),
      tags: analysis.rows
        .flatMap((row) => row.tags)
        .filter((tag, index, list) => list.indexOf(tag) === index)
        .map((nome) => ({ nome, action: "criar" as const })),
      payments: paymentRows.map((row) => ({
        rowId: row.id,
        action: "transferencia" as const,
        cardName: row.cartaoNome,
        createCard: row.cartaoNome !== "Cartão Teste",
        faturaChave: row.faturaChave,
      })),
      investments: analysis.investments.map((group) => ({
        groupKey: group.key,
        action: "despesa" as const,
      })),
      saldosIniciais: [{ sheetName: "Conta", action: "saldo_inicial" }],
      carryOver: analysis.carryOver.map((row) => ({
        rowId: row.id,
        action: "ignorar" as const,
      })),
      transferencias: [],
      ignoreRowIds: [],
      ignoreDuplicateRows: false,
      reimportarHash: false,
    },
  };
}

beforeEach(() => {
  testDb = createTestDatabase();
  installTestDatabase(testDb);
  user = createWorkspaceUser(testDb, {
    nome: "Ana",
    email: "ana@verde.local",
    role: "admin",
  });
  setCurrent(user);
});

afterEach(() => {
  state.user = null;
  resetTestDatabase();
});

function countTransactions(): number {
  return testDb.db
    .select({ id: transactions.id })
    .from(transactions)
    .where(
      and(
        eq(transactions.workspaceId, user.workspaceId),
        isNull(transactions.deletedAt),
      ),
    )
    .all().length;
}

describe("importação de planilha", () => {
  it("pré-visualiza sem escrever no banco", async () => {
    const before = countTransactions();
    const result = await previewSpreadsheetImportAction(buildRequest());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pending).toEqual([]);
    expect(result.canImport).toBe(true);
    expect(result.requiresReimport).toBe(false);
    expect(result.counts.rows).toBe(12);
    expect(result.counts.zeros).toBe(1);
    expect(result.counts.importable).toBe(9);
    expect(result.invoices.some((invoice) => invoice.faturaChave === "2022-10")).toBe(
      true,
    );
    expect(countTransactions()).toBe(before);
  });

  it("importa em transação, respeita override de fatura, tag, saldo e pagamentos", async () => {
    const result = await importSpreadsheetImportAction(buildRequest());
    if (!result.ok) throw new Error(result.error);
    expect(result.imported).toBe(9);
    expect(result.ignored).toBe(3);

    const account = testDb.db
      .select()
      .from(accounts)
      .where(
        and(
          eq(accounts.workspaceId, user.workspaceId),
          eq(accounts.nome, "Conta Teste"),
        ),
      )
      .get();
    expect(account?.saldoInicial).toBe(68_594);

    const card = testDb.db
      .select()
      .from(creditCards)
      .where(
        and(
          eq(creditCards.workspaceId, user.workspaceId),
          eq(creditCards.nome, "Cartão Teste"),
        ),
      )
      .get();
    expect(card?.arquivado).toBe(false);
    expect(card?.contaPagamentoId).toBe(account?.id);

    const historical = testDb.db
      .select()
      .from(creditCards)
      .where(
        and(
          eq(creditCards.workspaceId, user.workspaceId),
          eq(creditCards.nome, "Carbono"),
        ),
      )
      .get();
    expect(historical?.arquivado).toBe(true);
    expect(historical?.contaPagamentoId).toBe(account?.id);

    // Saldo inicial não vira receita.
    const initial = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, user.workspaceId),
          eq(transactions.descricao, "Saldo Inicial"),
        ),
      )
      .get();
    expect(initial).toBeUndefined();

    // Pagamento entra como transferência da conta para o cartão.
    const payment = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, user.workspaceId),
          eq(transactions.descricao, "Pagamento de fatura - Cartão Teste - Setembro de 2022"),
        ),
      )
      .get();
    expect(payment).toMatchObject({
      tipo: "transferencia",
      valor: 5000,
      contaId: account?.id,
      cartaoDestinoId: card?.id,
      faturaChave: "2022-09",
      importBatchId: result.batchId,
    });

    // Compra com fatura explícita diferente da calculada.
    const purchase = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, user.workspaceId),
          eq(transactions.descricao, "Compra cartão"),
        ),
      )
      .get();
    expect(purchase).toMatchObject({
      data: "2022-07-15",
      valor: 10_000,
      tipo: "despesa",
      pago: false,
      cartaoId: card?.id,
      faturaChave: null,
      faturaChaveOverride: "2022-10",
    });

    const september = listCardInvoiceEventsForMonth(
      user.workspaceId,
      "2022-09",
      FILTERS,
    ).find((event) => event.cartaoId === card?.id);
    expect(september).toMatchObject({
      total: 5_000,
      pago: 5_000,
      status: "paga",
    });

    const october = listCardInvoiceEventsForMonth(
      user.workspaceId,
      "2022-10",
      FILTERS,
    ).find((event) => event.cartaoId === card?.id);
    expect(october).toMatchObject({ total: 8_000, pago: 0 });

    const detail = getCardInvoiceDetail(
      user.workspaceId,
      card?.id ?? "",
      "2022-10",
    );
    expect(
      detail?.purchases.some((item) => item.descricao === "Compra cartão"),
    ).toBe(true);

    // Parcela preservada.
    const installment = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, user.workspaceId),
          eq(transactions.descricao, "Sky Team 4/4"),
        ),
      )
      .get();
    expect(installment).toMatchObject({
      parcelaAtual: 4,
      parcelaTotal: 4,
      faturaChaveOverride: "2022-09",
    });

    // Tag e observação multilinha preservadas.
    const market = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, user.workspaceId),
          eq(transactions.descricao, "Compra mercado"),
        ),
      )
      .get();
    expect(market?.observacao).toBe("Primeira linha\nSegunda linha");
    const tag = testDb.db
      .select()
      .from(tags)
      .where(
        and(
          eq(tags.workspaceId, user.workspaceId),
          eq(tags.nome, "juntando"),
        ),
      )
      .get();
    expect(tag).toBeDefined();
    const link = testDb.db
      .select()
      .from(transactionTags)
      .where(
        and(
          eq(transactionTags.workspaceId, user.workspaceId),
          eq(transactionTags.transactionId, market?.id ?? ""),
          eq(transactionTags.tagId, tag?.id ?? ""),
        ),
      )
      .get();
    expect(link).toBeDefined();

    // Zero e carry-over não entram.
    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.workspaceId, user.workspaceId),
            eq(transactions.descricao, "Linha zero"),
          ),
        )
        .get(),
    ).toBeUndefined();
    expect(
      testDb.db
        .select()
        .from(transactions)
        .where(
          and(
            eq(transactions.workspaceId, user.workspaceId),
            eq(transactions.descricao, "FATURA C6 // MES 07"),
          ),
        )
        .get(),
    ).toBeUndefined();

    // Categoria criada.
    expect(
      testDb.db
        .select()
        .from(categories)
        .where(
          and(
            eq(categories.workspaceId, user.workspaceId),
            eq(categories.nome, "Investimentos"),
            eq(categories.tipo, "despesa"),
          ),
        )
        .get(),
    ).toBeDefined();

    const batch = testDb.db
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, result.batchId))
      .get();
    expect(batch?.fileHash).toBe(HASH);
    expect(batch?.fileName).toBe("fixture.xlsx");
    expect(batch?.importedById).toBe(user.id);

    expect(getLatestImportBatch(user.workspaceId)).toMatchObject({
      batchId: result.batchId,
      count: 9,
      fileName: "fixture.xlsx",
    });
  });

  it("bloqueia o mesmo hash e permite reimportar com escolha explícita", async () => {
    const request = buildRequest();
    const imported = await importSpreadsheetImportAction(request);
    expect(imported.ok).toBe(true);

    const preview = await previewSpreadsheetImportAction(request);
    expect(preview.ok).toBe(true);
    if (!preview.ok) return;
    expect(preview.requiresReimport).toBe(true);
    expect(preview.canImport).toBe(false);
    expect(preview.existingBatch?.fileName).toBe("fixture.xlsx");

    const blocked = await importSpreadsheetImportAction(request);
    expect(blocked.ok).toBe(false);

    const reimport = await importSpreadsheetImportAction({
      ...request,
      decisions: {
        ...request.decisions,
        reimportarHash: true,
        saldosIniciais: [{ sheetName: "Conta", action: "ignorar" }],
      },
    });
    if (!reimport.ok) throw new Error(reimport.error);
    expect(reimport.ok).toBe(true);
  });

  it("desfaz o lote inteiro, inclusive compras de cartão e transferências", async () => {
    const result = await importSpreadsheetImportAction(buildRequest());
    if (!result.ok) throw new Error(result.error);
    expect(countTransactions()).toBe(9);

    const undo = await undoLastImportAction();
    expect(undo.ok).toBe(true);
    expect(countTransactions()).toBe(0);
  });

  it("marca as faturas importadas como pagas até a data escolhida", async () => {
    const request = buildRequest();
    const result = await importSpreadsheetImportAction({
      ...request,
      decisions: {
        ...request.decisions,
        considerarFaturasPagasAte: "2030-12-31",
      },
    });
    if (!result.ok) throw new Error(result.error);

    const card = testDb.db
      .select()
      .from(creditCards)
      .where(
        and(
          eq(creditCards.workspaceId, user.workspaceId),
          eq(creditCards.nome, "Cartão Teste"),
        ),
      )
      .get();
    expect(card?.faturasPagasAte).toBe("2030-12-31");

    const october = listCardInvoiceEventsForMonth(
      user.workspaceId,
      "2022-10",
      FILTERS,
    ).find((event) => event.cartaoId === card?.id);
    expect(october).toMatchObject({
      total: 8_000,
      pago: 8_000,
      restante: 0,
      status: "paga",
      consideradaPaga: true,
    });

    // Não cria pagamentos/transferências artificiais.
    expect(countTransactions()).toBe(9);
  });

  it("reutiliza cartão existente por alias em vez de criar fantasma", async () => {
    const now = new Date();
    const amazonId = crypto.randomUUID();
    testDb.db
      .insert(creditCards)
      .values({
        id: amazonId,
        workspaceId: user.workspaceId,
        nome: "Amazon Prime",
        bandeira: "visa",
        limite: 0,
        diaFechamento: 5,
        diaVencimento: 15,
        fechamentoCompra: "proxima_fatura",
        contaPagamentoId: null,
        cor: "#818cf8",
        icone: "CreditCard",
        arquivado: true,
        apelidos: ["Carbono"],
        createdAt: now,
        updatedAt: now,
      })
      .run();

    const result = await importSpreadsheetImportAction(buildRequest());
    if (!result.ok) throw new Error(result.error);

    const carbono = testDb.db
      .select()
      .from(creditCards)
      .where(
        and(
          eq(creditCards.workspaceId, user.workspaceId),
          eq(creditCards.nome, "Carbono"),
        ),
      )
      .get();
    expect(carbono).toBeUndefined();

    const payment = testDb.db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.workspaceId, user.workspaceId),
          eq(
            transactions.descricao,
            "Pagamento de fatura - Carbono - Agosto de 2022",
          ),
        ),
      )
      .get();
    expect(payment?.cartaoDestinoId).toBe(amazonId);
  });
});
