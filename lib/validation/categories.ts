import { z } from "zod";
import { CATEGORY_TYPES } from "@/lib/db/schema";
import {
  hexColorSchema,
  iconNameSchema,
  idSchema,
} from "./common";

export const categoryInputSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da categoria")
    .max(60, "Máximo de 60 caracteres"),
  tipo: z.enum(CATEGORY_TYPES),
  categoriaPaiId: idSchema.nullable(),
  cor: hexColorSchema,
  icone: iconNameSchema,
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
