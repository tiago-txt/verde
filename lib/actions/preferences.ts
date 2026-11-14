"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { saveFinancePreferences } from "@/lib/db/queries/finance-preferences";

export type FinancePreferenceActionResult =
  | { ok: true }
  | { ok: false; error: string };

const preferencesSchema = z.object({
  cardBasis: z.enum(["caixa", "competencia"], {
    message: "Base de cartão inválida.",
  }),
});

export async function saveCardBasisAction(input: {
  cardBasis: string;
}): Promise<FinancePreferenceActionResult> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Preferência inválida.",
    };
  }

  saveFinancePreferences(user.workspaceId, user.id, parsed.data);

  revalidatePath("/");
  revalidatePath("/lancamentos");
  revalidatePath("/relatorios");
  revalidatePath("/configuracoes");
  return { ok: true };
}
