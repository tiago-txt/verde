import { z } from "zod";
import {
  RECURRENCE_FREQUENCIES,
  TRANSACTION_TYPES,
} from "@/lib/db/schema";
import { idSchema, isoDateSchema } from "./common";

const transactionFields = z.object({
  tipo: z.enum(TRANSACTION_TYPES),
  descricao: z
    .string()
    .trim()
    .min(1, "Informe uma descrição")
    .max(200, "Máximo de 200 caracteres"),
  valor: z
    .number()
    .int("Valor inválido")
    .positive("O valor deve ser maior que zero"),
  data: isoDateSchema,
  pago: z.boolean(),
  contaId: idSchema,
  contaDestinoId: idSchema.nullable(),
  categoriaId: idSchema.nullable(),
  tagIds: z
    .array(idSchema)
    .max(20, "Máximo de 20 tags")
    .refine((ids) => new Set(ids).size === ids.length, "Tags duplicadas"),
  observacao: z.string().trim().max(1000, "Máximo de 1000 caracteres").nullable(),
  repeticao: z.enum(["nenhuma", "fixa", "parcelada"]),
  frequencia: z.enum(RECURRENCE_FREQUENCIES),
  dataFim: isoDateSchema.nullable(),
  parcelas: z
    .number()
    .int()
    .min(2, "O número de parcelas deve estar entre 2 e 60")
    .max(60, "O número de parcelas deve estar entre 2 e 60"),
  baseValor: z.enum(["total", "parcela"]),
});

export type TransactionFormValues = z.infer<typeof transactionFields>;

type RefinableTransaction = Pick<
  TransactionFormValues,
  | "tipo"
  | "contaId"
  | "contaDestinoId"
  | "categoriaId"
  | "repeticao"
  | "data"
  | "dataFim"
  | "valor"
  | "parcelas"
  | "baseValor"
>;

function refineTransaction(
  value: RefinableTransaction,
  ctx: z.RefinementCtx,
): void {
  if (value.tipo === "transferencia") {
    if (!value.contaDestinoId) {
      ctx.addIssue({
        code: "custom",
        path: ["contaDestinoId"],
        message: "Escolha a conta de destino",
      });
    } else if (value.contaDestinoId === value.contaId) {
      ctx.addIssue({
        code: "custom",
        path: ["contaDestinoId"],
        message: "A conta de destino deve ser diferente da origem",
      });
    }

    if (value.repeticao === "parcelada") {
      ctx.addIssue({
        code: "custom",
        path: ["repeticao"],
        message: "Transferências não podem ser parceladas",
      });
    }
  }

  if (value.repeticao === "fixa" && value.dataFim) {
    if (value.dataFim < value.data) {
      ctx.addIssue({
        code: "custom",
        path: ["dataFim"],
        message: "A data final deve ser depois da data inicial",
      });
    }
  }

  if (
    value.repeticao === "parcelada" &&
    value.baseValor === "total" &&
    value.valor < value.parcelas
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["parcelas"],
      message:
        "O valor total precisa ser de pelo menos 1 centavo por parcela",
    });
  }
}

export const createTransactionSchema = transactionFields.superRefine(
  refineTransaction,
);

export const transactionUpdateSchema = transactionFields
  .extend({
    id: idSchema,
    scope: z.enum(["single", "future", "all"]),
  })
  .superRefine(refineTransaction);

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof transactionUpdateSchema>;
