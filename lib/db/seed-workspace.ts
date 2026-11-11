import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { categories, tags } from "./schema";
import * as schema from "./schema";
import { DEFAULT_CATEGORIES, DEFAULT_TAGS } from "./seed-data";

type DatabaseInstance = BetterSQLite3Database<typeof schema>;

/**
 * Semeia categorias padrão (incluindo "Outros" de sistema) e tags em um
 * workspace. Idempotente por workspace: só cria quando ainda não há registros.
 */
export function seedWorkspaceDefaults(
  db: DatabaseInstance,
  workspaceId: string,
): void {
  const categoryCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(categories)
      .where(eq(categories.workspaceId, workspaceId))
      .get()?.count ?? 0;

  if (categoryCount === 0) {
    db.transaction((tx) => {
      for (const category of DEFAULT_CATEGORIES) {
        const parentId = crypto.randomUUID();
        tx.insert(categories)
          .values({
            id: parentId,
            workspaceId,
            nome: category.nome,
            tipo: category.tipo,
            icone: category.icone,
            cor: category.cor,
            isSystem: category.isSystem ?? false,
          })
          .run();

        for (const child of category.filhos ?? []) {
          tx.insert(categories)
            .values({
              id: crypto.randomUUID(),
              workspaceId,
              nome: child.nome,
              tipo: category.tipo,
              icone: child.icone,
              cor: child.cor,
              categoriaPaiId: parentId,
              isSystem: child.isSystem ?? false,
            })
            .run();
        }
      }
    });
  }

  const tagCount =
    db
      .select({ count: sql<number>`count(*)` })
      .from(tags)
      .where(eq(tags.workspaceId, workspaceId))
      .get()?.count ?? 0;

  if (tagCount === 0) {
    db.insert(tags)
      .values(DEFAULT_TAGS.map((nome) => ({ workspaceId, nome })))
      .run();
  }
}

/** Nome padrão do workspace pessoal de um usuário. */
export function workspaceNameFor(userName: string): string {
  const first = userName.trim().split(/\s+/)[0];
  return first ? `Espaço de ${first}` : "Meu espaço";
}

/** Garante que o workspace exista (usado no primeiro boot). */
export function ensureWorkspace(
  db: DatabaseInstance,
  workspaceId: string,
  nome: string,
): void {
  const existing = db
    .select({ id: schema.workspaces.id })
    .from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId))
    .get();
  if (existing) return;
  db.insert(schema.workspaces).values({ id: workspaceId, nome }).run();
}
