"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/current-user";
import { scopedDb } from "@/lib/db/scoped";
import { accounts } from "@/lib/db/schema";
import {
  countTransactionsForAccount,
  getAccountById,
} from "@/lib/db/queries/accounts";
import { accountInputSchema, type AccountInput } from "@/lib/validation/accounts";
import { idSchema } from "@/lib/validation/common";
import type { ActionResult } from "./result";

function revalidateAccounts() {
  revalidatePath("/");
  revalidatePath("/contas");
  revalidatePath("/lancamentos");
  revalidatePath("/configuracoes");
}

export async function createAccountAction(
  input: AccountInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db } = scopedDb(user.workspaceId);

  const parsed = accountInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  const id = crypto.randomUUID();
  try {
    db.insert(accounts)
      .values({ id, workspaceId: user.workspaceId, ...parsed.data })
      .run();
  } catch (error) {
    console.error("[verde] erro ao criar conta:", error);
    return {
      ok: false,
      error: "Já existe uma conta com esse nome.",
    };
  }

  revalidateAccounts();
  return { ok: true, id };
}

export async function updateAccountAction(
  id: string,
  input: AccountInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsedId = idSchema.safeParse(id);
  const parsed = accountInputSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) {
    return {
      ok: false,
      error:
        parsed.success === false
          ? parsed.error.issues[0]?.message ?? "Dados inválidos."
          : "Conta inválida.",
    };
  }

  const existing = getAccountById(user.workspaceId, parsedId.data);
  if (!existing) return { ok: false, error: "Conta não encontrada." };

  try {
    db.update(accounts)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(and(eq(accounts.id, parsedId.data), ws(accounts.workspaceId)))
      .run();
  } catch (error) {
    console.error("[verde] erro ao atualizar conta:", error);
    return { ok: false, error: "Já existe uma conta com esse nome." };
  }

  revalidateAccounts();
  return { ok: true, id: parsedId.data };
}

export async function setAccountArchivedAction(
  id: string,
  arquivada: boolean,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsed = z
    .object({ id: idSchema, arquivada: z.boolean() })
    .safeParse({ id, arquivada });
  if (!parsed.success) return { ok: false, error: "Dados inválidos." };

  const existing = getAccountById(user.workspaceId, parsed.data.id);
  if (!existing) return { ok: false, error: "Conta não encontrada." };

  db.update(accounts)
    .set({ arquivada: parsed.data.arquivada, updatedAt: new Date() })
    .where(
      and(eq(accounts.id, parsed.data.id), ws(accounts.workspaceId)),
    )
    .run();

  revalidateAccounts();
  return { ok: true, id: parsed.data.id };
}

export async function deleteAccountAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Conta inválida." };

  const existing = getAccountById(user.workspaceId, parsedId.data);
  if (!existing) return { ok: false, error: "Conta não encontrada." };

  const transactionCount = countTransactionsForAccount(
    user.workspaceId,
    parsedId.data,
  );
  if (transactionCount > 0) {
    return {
      ok: false,
      code: "HAS_TRANSACTIONS",
      error: `Esta conta possui ${transactionCount} lançamento(s). Arquive-a em vez de excluir.`,
    };
  }

  db.delete(accounts)
    .where(and(eq(accounts.id, parsedId.data), ws(accounts.workspaceId)))
    .run();
  revalidateAccounts();
  return { ok: true };
}
