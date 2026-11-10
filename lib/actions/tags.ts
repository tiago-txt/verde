"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { idSchema } from "@/lib/validation/common";
import { tagInputSchema, type TagInput } from "@/lib/validation/tags";
import type { ActionResult } from "./result";

function revalidateTags() {
  revalidatePath("/lancamentos");
  revalidatePath("/configuracoes/categorias");
}

function findTagByName(nome: string, excludeId?: string) {
  const conditions = [sql`lower(${tags.nome}) = lower(${nome})`];
  if (excludeId) conditions.push(ne(tags.id, excludeId));

  return getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(and(...conditions))
    .get();
}

export async function createTagAction(input: TagInput): Promise<ActionResult> {
  await requireUser();

  const parsed = tagInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  if (findTagByName(parsed.data.nome)) {
    return { ok: false, error: "Já existe uma tag com esse nome." };
  }

  const id = crypto.randomUUID();
  getDb().insert(tags).values({ id, nome: parsed.data.nome }).run();
  revalidateTags();
  return { ok: true, id };
}

export async function renameTagAction(
  id: string,
  input: TagInput,
): Promise<ActionResult> {
  await requireUser();

  const parsedId = idSchema.safeParse(id);
  const parsed = tagInputSchema.safeParse(input);
  if (!parsedId.success || !parsed.success) {
    return {
      ok: false,
      error:
        parsed.success === false
          ? parsed.error.issues[0]?.message ?? "Dados inválidos."
          : "Tag inválida.",
    };
  }

  const existing = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.id, parsedId.data))
    .get();
  if (!existing) return { ok: false, error: "Tag não encontrada." };

  if (findTagByName(parsed.data.nome, parsedId.data)) {
    return { ok: false, error: "Já existe uma tag com esse nome." };
  }

  getDb()
    .update(tags)
    .set({ nome: parsed.data.nome })
    .where(eq(tags.id, parsedId.data))
    .run();

  revalidateTags();
  return { ok: true, id: parsedId.data };
}

export async function deleteTagAction(id: string): Promise<ActionResult> {
  await requireUser();

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Tag inválida." };

  const existing = getDb()
    .select({ id: tags.id })
    .from(tags)
    .where(eq(tags.id, parsedId.data))
    .get();
  if (!existing) return { ok: false, error: "Tag não encontrada." };

  // O vínculo transaction_tags é removido por ON DELETE CASCADE.
  getDb().delete(tags).where(eq(tags.id, parsedId.data)).run();
  revalidateTags();
  return { ok: true };
}
