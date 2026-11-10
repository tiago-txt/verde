import { z } from "zod";

export const tagInputSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe o nome da tag")
    .max(30, "Máximo de 30 caracteres"),
});

export type TagInput = z.infer<typeof tagInputSchema>;
