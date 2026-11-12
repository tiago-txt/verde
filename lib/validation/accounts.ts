import { z } from "zod";
import { ACCOUNT_TYPES } from "@/lib/db/schema";
import {
  bankOrIconNameSchema,
  centsSchema,
  hexColorSchema,
} from "./common";

export const accountInputSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da conta")
    .max(80, "Máximo de 80 caracteres"),
  tipo: z.enum(ACCOUNT_TYPES),
  saldoInicial: centsSchema,
  cor: hexColorSchema,
  icone: bankOrIconNameSchema,
});

export type AccountInput = z.infer<typeof accountInputSchema>;
