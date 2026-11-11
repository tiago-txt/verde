import { z } from "zod";
import { isValidISODate } from "@/lib/dates";

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
