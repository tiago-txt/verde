import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { SESSION_COOKIE, verifySessionToken } from "./jwt";

/**
 * Usuário autenticado (ou null). O cookie é validado criptograficamente e o
 * usuário é reconferido no banco — assim remover/desativar um usuário invalida
 * o acesso mesmo que o token ainda esteja válido.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await verifySessionToken(token);
  if (!session) return null;

  const user = getDb()
    .select()
    .from(users)
    .where(eq(users.id, session.userId))
    .get();

  if (!user || !user.ativo) return null;
  // Sessão de outro workspace/role (ex.: token antigo) é descartada.
  if (user.workspaceId !== session.workspaceId) return null;

  return user;
});

/**
 * Usuário autenticado, forçando a troca de senha temporária no primeiro login.
 * Use `requireSessionUser` apenas nas telas de troca de senha/perfil.
 */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/trocar-senha");
  return user;
}

/** Usuário autenticado sem o redirecionamento de troca de senha. */
export async function requireSessionUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * Usuário para route handlers/APIs: exige sessão válida e senha já trocada.
 * Retorna null (o handler responde 401) para usuário inativo ou com senha
 * temporária pendente.
 */
export async function getApiUser(): Promise<User | null> {
  const user = await getCurrentUser();
  if (!user || user.mustChangePassword) return null;
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
