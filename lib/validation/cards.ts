import { z } from "zod";
import { CARD_BRANDS, CARD_CLOSING_BEHAVIORS } from "@/lib/db/schema";
import {
  hexColorSchema,
  iconNameSchema,
  idSchema,
  isoDateSchema,
  monthKeySchema,
} from "./common";

const cardFields = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe um nome")
    .max(80, "Máximo de 80 caracteres"),
  bandeira: z.enum(CARD_BRANDS),
  limite: z
    .number()
    .int("Limite inválido")
    .positive("O limite deve ser maior que zero"),
  diaFechamento: z
    .number()
    .int("Dia inválido")
    .min(1, "O dia de fechamento deve estar entre 1 e 31")
    .max(31, "O dia de fechamento deve estar entre 1 e 31"),
  diaVencimento: z
    .number()
    .int("Dia inválido")
    .min(1, "O dia de vencimento deve estar entre 1 e 31")
    .max(31, "O dia de vencimento deve estar entre 1 e 31"),
  fechamentoCompra: z.enum(CARD_CLOSING_BEHAVIORS).optional(),
  contaPagamentoId: idSchema.nullable(),
  cor: hexColorSchema,
  icone: iconNameSchema,
});

export const createCardSchema = cardFields;
export const updateCardSchema = cardFields.extend({ id: idSchema });

export const payInvoiceSchema = z.object({
  cartaoId: idSchema,
  faturaChave: monthKeySchema,
  contaId: idSchema,
  valor: z
    .number()
    .int("Valor inválido")
    .positive("O valor deve ser maior que zero"),
  data: isoDateSchema,
});

export type CardFormValues = z.infer<typeof cardFields>;
export type UpdateCardInput = z.infer<typeof updateCardSchema>;
export type PayInvoiceInput = z.infer<typeof payInvoiceSchema>;
