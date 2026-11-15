import { z } from "zod";
import { isValidISODate } from "@/lib/dates";
import { idSchema, isoDateSchema, monthKeySchema } from "./common";

const headerName = z.string().trim().min(1, "Escolha uma coluna");

export const csvMappingSchema = z.object({
  data: headerName,
  descricao: headerName,
  valor: headerName,
  tipo: headerName,
  conta: z.string().trim().optional(),
  categoria: z.string().trim().optional(),
  pago: z.string().trim().optional(),
});

export const importOptionsSchema = z.object({
  ignoreDuplicates: z.boolean(),
  createMissing: z.boolean(),
});

export const importRequestSchema = z.object({
  csv: z
    .string()
    .min(1, "Arquivo vazio")
    .max(5_500_000, "Arquivo acima do limite de 5 MB"),
  mapping: csvMappingSchema,
  options: importOptionsSchema,
});

export const exportRangeSchema = z
  .object({
    de: z.string().refine(isValidISODate, "Data inicial inválida"),
    ate: z.string().refine(isValidISODate, "Data final inválida"),
  })
  .refine((value) => value.de <= value.ate, {
    path: ["ate"],
    message: "A data final deve ser depois da inicial",
  });

export type ImportRequestInput = z.infer<typeof importRequestSchema>;

const optionalName = z.string().trim().min(1).max(200);
const optionalId = idSchema.nullable().optional();

export const canonicalSpreadsheetRowSchema = z
  .object({
    id: z.string().trim().min(1).max(400),
    sheetName: z.string().trim().min(1).max(200),
    sheetKind: z.enum(["conta", "cartao"]),
    sourceRow: z.number().int().min(2).max(1_000_000),
    data: z.string().refine(isValidISODate, "Data inválida"),
    descricao: z.string().trim().min(1).max(2_000),
    valorCentavos: z.number().int().min(0).max(999_999_999_99),
    tipo: z.enum(["despesa", "receita", "transferencia"]),
    categoriaNome: z.string().trim().max(200).nullable(),
    pago: z.boolean(),
    origemNome: z.string().trim().min(1).max(200),
    faturaChave: monthKeySchema.nullable(),
    cartaoNome: z.string().trim().max(200).nullable().optional(),
    tags: z.array(z.string().trim().min(1).max(100)).max(50),
    observacao: z.string().max(20_000).nullable(),
    parcelaAtual: z.number().int().min(1).max(60).nullable(),
    parcelaTotal: z.number().int().min(1).max(60).nullable(),
    parcelaGrupoId: z.string().trim().max(300).nullable(),
    specialKind: z
      .enum([
        "pagamento_fatura",
        "pagamento_positivo",
        "investimento",
        "saldo_inicial",
        "correcao_saldo",
        "carry_over",
        "cartao_adicional",
        "transferencia",
        "zero",
      ])
      .nullable(),
    warnings: z.array(z.string().max(500)).max(50),
    duplicateKey: z.string().max(1_000),
  })
  .superRefine((row, context) => {
    if (
      row.parcelaAtual !== null &&
      row.parcelaTotal !== null &&
      row.parcelaAtual > row.parcelaTotal
    ) {
      context.addIssue({
        code: "custom",
        path: ["parcelaAtual"],
        message: "Parcela atual maior que o total",
      });
    }
  });

export const spreadsheetDecisionsSchema = z.object({
  origins: z
    .array(
      z.object({
        sheetName: z.string().trim().min(1).max(200),
        kind: z.enum(["conta", "cartao"]),
        accountId: optionalId,
        accountName: optionalName.nullable().optional(),
        cardId: optionalId,
        cardName: optionalName.nullable().optional(),
        createAccount: z.boolean().optional(),
        createCard: z.boolean().optional(),
        diaFechamento: z.number().int().min(1).max(31).optional(),
        diaVencimento: z.number().int().min(1).max(31).optional(),
        saldoInicial: z.number().int().optional(),
        aplicarSaldoInicial: z.boolean().optional(),
      }),
    )
    .max(50),
  categories: z
    .array(
      z.object({
        key: z.string().trim().min(1).max(400),
        tipo: z.enum(["despesa", "receita"]),
        action: z.enum(["existente", "criar", "ignorar"]),
        categoryId: optionalId,
        nome: optionalName.optional(),
      }),
    )
    .max(2_000),
  tags: z
    .array(
      z.object({
        nome: z.string().trim().min(1).max(100),
        action: z.enum(["existente", "criar", "ignorar"]),
        tagId: optionalId,
      }),
    )
    .max(2_000),
  payments: z
    .array(
      z.object({
        rowId: z.string().trim().min(1).max(400),
        action: z.enum(["transferencia", "despesa", "receita", "ignorar"]),
        cardId: optionalId,
        cardName: optionalName.nullable().optional(),
        createCard: z.boolean().optional(),
        diaFechamento: z.number().int().min(1).max(31).optional(),
        diaVencimento: z.number().int().min(1).max(31).optional(),
        faturaChave: monthKeySchema.nullable().optional(),
      }),
    )
    .max(50_000),
  investments: z
    .array(
      z.object({
        groupKey: z.string().trim().min(1).max(600),
        action: z.enum(["despesa", "transferencia", "ignorar"]),
        contaDestinoId: optionalId,
        categoriaId: optionalId,
      }),
    )
    .max(5_000),
  saldosIniciais: z
    .array(
      z.object({
        sheetName: z.string().trim().min(1).max(200),
        action: z.enum(["saldo_inicial", "ajuste", "ignorar"]),
      }),
    )
    .max(50),
  carryOver: z
    .array(
      z.object({
        rowId: z.string().trim().min(1).max(400),
        action: z.enum(["compra", "ignorar"]),
        cartaoId: optionalId,
      }),
    )
    .max(10_000),
  transferencias: z
    .array(
      z.object({
        rowId: z.string().trim().min(1).max(400),
        action: z.enum(["despesa", "receita", "transferencia", "ignorar"]),
        contaDestinoId: optionalId,
      }),
    )
    .max(10_000),
  ignoreRowIds: z.array(z.string().trim().min(1).max(400)).max(50_000),
  ignoreDuplicateRows: z.boolean().optional(),
  reimportarHash: z.boolean().optional(),
  /** Considera pagas as faturas importadas com vencimento até esta data. */
  considerarFaturasPagasAte: isoDateSchema.nullable().optional(),
});

export const spreadsheetImportRequestSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/i, "Hash do arquivo inválido"),
  rows: z
    .array(canonicalSpreadsheetRowSchema)
    .max(50_000, "A planilha excede o limite de 50 mil linhas"),
  decisions: spreadsheetDecisionsSchema,
});

export type CanonicalSpreadsheetRowInput = z.infer<
  typeof canonicalSpreadsheetRowSchema
>;
export type SpreadsheetDecisionsInput = z.infer<
  typeof spreadsheetDecisionsSchema
>;
export type SpreadsheetImportRequestInput = z.infer<
  typeof spreadsheetImportRequestSchema
>;
