import { z } from "zod";
import { isValidISODate, isValidMonthKey } from "@/lib/dates";
import { ICON_NAMES, isIconName } from "@/lib/icon-names";
import { isBankIconId } from "@/lib/finance/bank-icons";

export const idSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    "Identificador inválido",
  );

export const isoDateSchema = z
  .string()
  .refine(isValidISODate, "Data inválida (use YYYY-MM-DD)");

export const monthKeySchema = z
  .string()
  .refine(isValidMonthKey, "Mês inválido (use YYYY-MM)");

export const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "Cor inválida");

export const iconNameSchema = z.enum(ICON_NAMES);

/** Ícone genérico ou identificador local `bank:*`. */
export const bankOrIconNameSchema = z
  .string()
  .refine(
    (value) => isIconName(value) || isBankIconId(value),
    "Ícone inválido",
  );

export const centsSchema = z
  .number()
  .int("Use centavos inteiros")
  .min(-999_999_999_99, "Valor muito baixo")
  .max(999_999_999_99, "Valor muito alto");
