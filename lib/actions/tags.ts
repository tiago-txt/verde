"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/current-user";
import { scopedDb } from "@/lib/db/scoped";
import { tags } from "@/lib/db/schema";
import { idSchema } from "@/lib/validation/common";
import { tagInputSchema, type TagInput } from "@/lib/validation/tags";
import type { ActionResult } from "./result";

function revalidateTags() {
  revalidatePath("/lancamentos");
  revalidatePath("/configuracoes/categorias");
}

function findTagByName(workspaceId: string, nome: string, excludeId?: string) {
  const { db, ws } = scopedDb(workspaceId);
  const conditions = [
    ws(tags.workspaceId),
    sql`lower(${tags.nome}) = lower(${nome})`,
  ];
  if (excludeId) conditions.push(ne(tags.id, excludeId));

  return db
    .select({ id: tags.id })
    .from(tags)
    .where(and(...conditions))
    .get();
}

export async function createTagAction(input: TagInput): Promise<ActionResult> {
  const user = await requireUser();
  const { db } = scopedDb(user.workspaceId);

  const parsed = tagInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
    };
  }

  if (findTagByName(user.workspaceId, parsed.data.nome)) {
    return { ok: false, error: "Já existe uma tag com esse nome." };
  }

  const id = crypto.randomUUID();
  db.insert(tags)
    .values({ id, workspaceId: user.workspaceId, nome: parsed.data.nome })
    .run();
  revalidateTags();
  return { ok: true, id };
}

export async function renameTagAction(
  id: string,
  input: TagInput,
): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

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

  const existing = db
    .select({ id: tags.id })
    .from(tags)
    .where(
      and(eq(tags.id, parsedId.data), ws(tags.workspaceId)),
    )
    .get();
  if (!existing) return { ok: false, error: "Tag não encontrada." };

  if (findTagByName(user.workspaceId, parsed.data.nome, parsedId.data)) {
    return { ok: false, error: "Já existe uma tag com esse nome." };
  }

  db.update(tags)
    .set({ nome: parsed.data.nome })
    .where(and(eq(tags.id, parsedId.data), ws(tags.workspaceId)))
    .run();

  revalidateTags();
  return { ok: true, id: parsedId.data };
}

export async function deleteTagAction(id: string): Promise<ActionResult> {
  const user = await requireUser();
  const { db, ws } = scopedDb(user.workspaceId);

  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return { ok: false, error: "Tag inválida." };

  const existing = db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.id, parsedId.data), ws(tags.workspaceId)))
    .get();
  if (!existing) return { ok: false, error: "Tag não encontrada." };

  // O vínculo transaction_tags é removido por ON DELETE CASCADE.
  db.delete(tags)
    .where(and(eq(tags.id, parsedId.data), ws(tags.workspaceId)))
    .run();
  revalidateTags();
  return { ok: true };
}
