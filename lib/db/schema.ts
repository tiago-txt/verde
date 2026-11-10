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
    arquivado: integer("arquivado", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    check("credit_cards_fechamento_check", sql`${table.diaFechamento} between 1 and 31`),
    check("credit_cards_vencimento_check", sql`${table.diaVencimento} between 1 and 31`),
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
    ...timestamps,
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("transactions_data_idx").on(table.data),
    index("transactions_conta_idx").on(table.contaId),
    index("transactions_cartao_idx").on(table.cartaoId),
    index("transactions_categoria_idx").on(table.categoriaId),
    index("transactions_recorrencia_idx").on(table.recorrenciaId),
    index("transactions_parcela_grupo_idx").on(table.parcelaGrupoId),
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

/** Limite de gastos por categoria e mês (YYYY-MM). */
export const budgets = sqliteTable(
  "budgets",
  {
    id: id(),
    categoriaId: text("categoria_id")
      .notNull()
      .references(() => categories.id, { onDelete: "cascade" }),
    mes: text("mes").notNull(),
    valorLimite: integer("valor_limite").notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("budgets_categoria_mes_unique").on(table.categoriaId, table.mes),
    check("budgets_valor_check", sql`${table.valorLimite} >= 0`),
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
