import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
};

export const ACCOUNT_TYPES = [
  "corrente",
  "poupanca",
  "dinheiro",
  "investimento",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const CATEGORY_TYPES = ["despesa", "receita"] as const;
export type CategoryType = (typeof CATEGORY_TYPES)[number];

export const TRANSACTION_TYPES = ["despesa", "receita", "transferencia"] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const RECURRENCE_FREQUENCIES = ["mensal", "semanal", "anual"] as const;
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

export const CARD_BRANDS = [
  "visa",
  "mastercard",
  "elo",
  "amex",
  "hipercard",
  "outra",
] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

/** Quando a reserva do envelope sai da conta. */
export const BUDGET_RESERVE_DATES = [
  "inicio_do_ciclo",
  "vencimento_da_fatura",
] as const;
export type BudgetReserveDate = (typeof BUDGET_RESERVE_DATES)[number];

/** Origens de gasto que consomem o envelope. */
export const BUDGET_ORIGINS = ["todas", "cartao", "contas"] as const;
export type BudgetOrigin = (typeof BUDGET_ORIGINS)[number];

/** Campos copiados para cada lançamento gerado por uma recorrência. */
export type RecurrenceTemplate = {
  tipo: TransactionType;
  descricao: string;
  valor: number;
  contaId: string | null;
  cartaoId: string | null;
  contaDestinoId: string | null;
  categoriaId: string | null;
  observacao: string | null;
  tagIds: string[];
  pago: boolean;
};

export const users = sqliteTable(
  "users",
  {
    id: id(),
    nome: text("nome").notNull(),
    email: text("email").notNull(),
    senhaHash: text("senha_hash").notNull(),
    isAdmin: integer("is_admin", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const accounts = sqliteTable(
  "accounts",
  {
    id: id(),
    nome: text("nome").notNull(),
    tipo: text("tipo", { enum: ACCOUNT_TYPES }).notNull(),
    saldoInicial: integer("saldo_inicial").notNull().default(0),
    cor: text("cor").notNull().default("#34d399"),
    icone: text("icone").notNull().default("Wallet"),
    arquivada: integer("arquivada", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("accounts_arquivada_idx").on(table.arquivada)],
);

export const creditCards = sqliteTable(
  "credit_cards",
  {
    id: id(),
    nome: text("nome").notNull(),
    bandeira: text("bandeira").notNull().default("outra"),
    limite: integer("limite").notNull().default(0),
    diaFechamento: integer("dia_fechamento").notNull(),
    diaVencimento: integer("dia_vencimento").notNull(),
    contaPagamentoId: text("conta_pagamento_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    cor: text("cor").notNull().default("#818cf8"),
    icone: text("icone").notNull().default("CreditCard"),
    arquivado: integer("arquivado", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("credit_cards_arquivado_idx").on(table.arquivado),
    check("credit_cards_fechamento_check", sql`${table.diaFechamento} between 1 and 31`),
    check("credit_cards_vencimento_check", sql`${table.diaVencimento} between 1 and 31`),
    check("credit_cards_limite_check", sql`${table.limite} >= 0`),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: id(),
    nome: text("nome").notNull(),
    tipo: text("tipo", { enum: CATEGORY_TYPES }).notNull(),
    icone: text("icone").notNull().default("CircleEllipsis"),
    cor: text("cor").notNull().default("#94a3b8"),
    categoriaPaiId: text("categoria_pai_id"),
    /** Categorias de sistema (ex.: Outros) não podem ser excluídas/arquivadas. */
    isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("categories_tipo_idx").on(table.tipo),
    index("categories_pai_idx").on(table.categoriaPaiId),
  ],
);

export const recurrences = sqliteTable(
  "recurrences",
  {
    id: id(),
    frequencia: text("frequencia", { enum: RECURRENCE_FREQUENCIES }).notNull(),
    dataInicio: text("data_inicio").notNull(),
    dataFim: text("data_fim"),
    ativo: integer("ativo", { mode: "boolean" }).notNull().default(true),
    template: text("template", { mode: "json" })
      .$type<RecurrenceTemplate>()
      .notNull(),
    ...timestamps,
  },
  (table) => [index("recurrences_ativo_idx").on(table.ativo)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: id(),
    tipo: text("tipo", { enum: TRANSACTION_TYPES }).notNull(),
    descricao: text("descricao").notNull(),
    /** Valor sempre positivo, em centavos. O tipo define entrada/saída. */
    valor: integer("valor").notNull(),
    data: text("data").notNull(),
    pago: integer("pago", { mode: "boolean" }).notNull().default(false),
    contaId: text("conta_id").references(() => accounts.id, { onDelete: "set null" }),
    cartaoId: text("cartao_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
    contaDestinoId: text("conta_destino_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    /** Destino de transferência que paga uma fatura de cartão. */
    cartaoDestinoId: text("cartao_destino_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
    /** Fatura paga por esta transferência (YYYY-MM do vencimento). */
    faturaChave: text("fatura_chave"),
    categoriaId: text("categoria_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    observacao: text("observacao"),
    recorrenciaId: text("recorrencia_id").references(() => recurrences.id, {
      onDelete: "set null",
    }),
    parcelaAtual: integer("parcela_atual"),
    parcelaTotal: integer("parcela_total"),
    /** Agrupa as parcelas de uma mesma compra. */
    parcelaGrupoId: text("parcela_grupo_id"),
    /** Identifica o lote de uma importação de CSV (permite desfazer). */
    importBatchId: text("import_batch_id"),
    ...timestamps,
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("transactions_data_idx").on(table.data),
    index("transactions_conta_idx").on(table.contaId),
    index("transactions_cartao_idx").on(table.cartaoId),
    index("transactions_cartao_data_idx").on(table.cartaoId, table.data),
    index("transactions_cartao_destino_idx").on(table.cartaoDestinoId),
    index("transactions_fatura_chave_idx").on(table.faturaChave),
    index("transactions_categoria_idx").on(table.categoriaId),
    index("transactions_recorrencia_idx").on(table.recorrenciaId),
    index("transactions_parcela_grupo_idx").on(table.parcelaGrupoId),
    index("transactions_tipo_idx").on(table.tipo),
    index("transactions_pago_idx").on(table.pago),
    index("transactions_data_pago_idx").on(table.data, table.pago),
    index("transactions_data_categoria_idx").on(table.data, table.categoriaId),
    index("transactions_data_tipo_pago_idx").on(
      table.data,
      table.tipo,
      table.pago,
    ),
    index("transactions_import_batch_idx").on(table.importBatchId),
    // Garante idempotência da geração de recorrências (inclusive após soft delete).
    uniqueIndex("transactions_recorrencia_data_unique").on(
      table.recorrenciaId,
      table.data,
    ),
    check("transactions_valor_check", sql`${table.valor} >= 0`),
  ],
);

export const tags = sqliteTable(
  "tags",
  {
    id: id(),
    nome: text("nome").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [uniqueIndex("tags_nome_unique").on(table.nome)],
);

export const transactionTags = sqliteTable(
  "transaction_tags",
  {
    transactionId: text("transaction_id")
      .notNull()
      .references(() => transactions.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.transactionId, table.tagId] }),
    index("transaction_tags_tag_idx").on(table.tagId),
  ],
);

/** Orçamento-envelope com ciclo (tipo fatura). */
export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    nome: text("nome").notNull().default(""),
    valorPadrao: integer("valor_padrao_centavos").notNull().default(0),
    diaFechamento: integer("dia_fechamento").notNull().default(1),
    antecedenciaCiclos: integer("antecedencia_ciclos").notNull().default(0),
    /** `inicio_do_ciclo` (padrão) ou `vencimento_da_fatura`. */
    dataDaReserva: text("data_da_reserva", { enum: BUDGET_RESERVE_DATES })
      .notNull()
      .default("inicio_do_ciclo"),
    /** Vencimento próprio quando não há cartão vinculado. */
    diaVencimento: integer("dia_vencimento").notNull().default(1),
    /** Origens que consomem: todas, somente cartão ou somente contas. */
    origens: text("origens", { enum: BUDGET_ORIGINS })
      .notNull()
      .default("todas"),
    contaId: text("conta_id").references(() => accounts.id, {
      onDelete: "set null",
    }),
    /** Cartão vinculado: define fechamento/vencimento da fatura da reserva. */
    cartaoId: text("cartao_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
    /** Primeiro ciclo de vigência (YYYY-MM). */
    dataInicio: text("data_inicio").notNull().default(""),
    /** Último ciclo de vigência (YYYY-MM), inclusive. */
    dataFim: text("data_fim"),
    cor: text("cor").notNull().default("#34d399"),
    icone: text("icone").notNull().default("Target"),
    arquivado: integer("arquivado", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
    /** @deprecated legado da Etapa 1 (limite por categoria/mês). */
    categoriaId: text("categoria_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    /** @deprecated legado da Etapa 1. */
    mes: text("mes").notNull(),
    /** @deprecated legado da Etapa 1. */
    valorLimite: integer("valor_limite").notNull(),
  },
  (table) => [
    index("budgets_arquivado_idx").on(table.arquivado),
    check("budgets_valor_check", sql`${table.valorLimite} >= 0`),
    check(
      "budgets_fechamento_check",
      sql`${table.diaFechamento} between 1 and 31`,
    ),
    check(
      "budgets_antecedencia_check",
      sql`${table.antecedenciaCiclos} in (0, 1)`,
    ),
    check(
      "budgets_data_reserva_check",
      sql`${table.dataDaReserva} in ('inicio_do_ciclo', 'vencimento_da_fatura')`,
    ),
    check(
      "budgets_dia_vencimento_check",
      sql`${table.diaVencimento} between 1 and 31`,
    ),
    check(
      "budgets_origens_check",
      sql`${table.origens} in ('todas', 'cartao', 'contas')`,
    ),
  ],
);

export const budgetCategories = sqliteTable(
  "budget_categories",
  {
    budgetId: text("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.budgetId, table.categoryId] }),
    index("budget_categories_category_idx").on(table.categoryId),
  ],
);

/** Valor específico de um ciclo (YYYY-MM) sem alterar o padrão. */
export const budgetOverrides = sqliteTable(
  "budget_overrides",
  {
    budgetId: text("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    ciclo: text("ciclo").notNull(),
    valorCentavos: integer("valor_centavos").notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.budgetId, table.ciclo] }),
    check("budget_overrides_valor_check", sql`${table.valorCentavos} >= 0`),
  ],
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type CreditCard = typeof creditCards.$inferSelect;
export type NewCreditCard = typeof creditCards.$inferInsert;
export type Category = typeof categories.$inferSelect;
export type NewCategory = typeof categories.$inferInsert;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Recurrence = typeof recurrences.$inferSelect;
export type NewRecurrence = typeof recurrences.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type NewBudget = typeof budgets.$inferInsert;
export type BudgetCategory = typeof budgetCategories.$inferSelect;
export type BudgetOverride = typeof budgetOverrides.$inferSelect;
