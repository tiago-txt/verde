import { z } from "zod";
import { BUDGET_ORIGINS, BUDGET_SOBRA_POLICIES } from "@/lib/db/schema";
import {
  hexColorSchema,
  iconNameSchema,
  idSchema,
  monthKeySchema,
} from "./common";

const budgetFields = z.object({
  nome: z
    .string()
    .trim()
    .min(1, "Informe um nome")
    .max(80, "Máximo de 80 caracteres"),
  valorPadrao: z
    .number()
    .int("Valor inválido")
    .positive("O valor do ciclo deve ser maior que zero"),
  diaFechamento: z
    .number()
    .int("Dia inválido")
    .min(1, "O dia de fechamento deve estar entre 1 e 31")
    .max(31, "O dia de fechamento deve estar entre 1 e 31"),
  antecedenciaCiclos: z.union([z.literal(0), z.literal(1)], {
    error: "A antecedência deve ser 0 ou 1 ciclo",
  }),
  origens: z.enum(BUDGET_ORIGINS).default("todas"),
  sobraPolicy: z.enum(BUDGET_SOBRA_POLICIES).optional(),
  sobraDestinoBudgetId: idSchema.nullable().optional(),
  categoriaIds: z
    .array(idSchema)
    .min(1, "Escolha pelo menos uma categoria")
    .max(50, "Máximo de 50 categorias")
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Categorias duplicadas",
    ),
  contaId: idSchema.nullable(),
  cartaoId: idSchema.nullable().default(null),
  cor: hexColorSchema,
  icone: iconNameSchema,
  dataInicio: monthKeySchema,
  dataFim: monthKeySchema.nullable(),
});

function refinePeriod(
  value: { dataInicio: string; dataFim: string | null },
  ctx: z.RefinementCtx,
): void {
  if (value.dataFim && value.dataFim < value.dataInicio) {
    ctx.addIssue({
      code: "custom",
      path: ["dataFim"],
      message: "O fim deve ser depois do início",
    });
  }
}

function refineSobra(
  value: {
    sobraPolicy?: "rolar" | "liberar" | "realocar";
    sobraDestinoBudgetId?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  if (
    value.sobraPolicy === "realocar" &&
    !value.sobraDestinoBudgetId
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["sobraDestinoBudgetId"],
      message: "Escolha o orçamento de destino",
    });
  }
}

function refineBudget(
  value: {
    dataInicio: string;
    dataFim: string | null;
    sobraPolicy?: "rolar" | "liberar" | "realocar";
    sobraDestinoBudgetId?: string | null;
  },
  ctx: z.RefinementCtx,
): void {
  refinePeriod(value, ctx);
  refineSobra(value, ctx);
}

export const createBudgetSchema = budgetFields.superRefine(refineBudget);

export const updateBudgetSchema = budgetFields
  .extend({
    id: idSchema,
    scope: z.enum(["single", "future", "all"]),
    ciclo: monthKeySchema,
  })
  .superRefine(refineBudget);

export const budgetOverrideSchema = z.object({
  budgetId: idSchema,
  ciclo: monthKeySchema,
  valorCentavos: z
    .number()
    .int("Valor inválido")
    .positive("O valor deve ser maior que zero"),
});

export type BudgetFormValues = z.infer<typeof budgetFields>;
export type UpdateBudgetInput = z.infer<typeof updateBudgetSchema>;
export type BudgetOverrideInput = z.infer<typeof budgetOverrideSchema>;
