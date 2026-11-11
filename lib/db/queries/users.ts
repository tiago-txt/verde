import { and, asc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, workspaces, type UserRole } from "@/lib/db/schema";

export type AdminUserRow = {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  ativo: boolean;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
  workspaceId: string;
  workspaceNome: string;
};

/**
 * Metadados de usuários para a tela administrativa. Nunca inclui dados
 * financeiros — o admin só enxerga a existência e o estado das contas.
 */
export function listUsersForAdmin(): AdminUserRow[] {
  return getDb()
    .select({
      id: users.id,
      nome: users.nome,
      email: users.email,
      role: users.role,
      ativo: users.ativo,
      mustChangePassword: users.mustChangePassword,
      lastLoginAt: users.lastLoginAt,
      createdAt: users.createdAt,
      workspaceId: users.workspaceId,
      workspaceNome: workspaces.nome,
    })
    .from(users)
    .innerJoin(workspaces, eq(users.workspaceId, workspaces.id))
    .orderBy(asc(users.nome))
    .all();
}

export function getUserById(id: string) {
  return getDb().select().from(users).where(eq(users.id, id)).get();
}

export function getUserByEmail(email: string) {
  return getDb().select().from(users).where(eq(users.email, email)).get();
}

export function countActiveAdmins(excludeUserId?: string): number {
  const conditions = [eq(users.role, "admin"), eq(users.ativo, true)];
  if (excludeUserId) conditions.push(ne(users.id, excludeUserId));

  const row = getDb()
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(and(...conditions))
    .get();

  return row?.count ?? 0;
}
