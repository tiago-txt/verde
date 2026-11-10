import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { SESSION_COOKIE, verifySessionToken } from "./jwt";

/**
 * Usuário autenticado (ou null). O cookie é validado criptograficamente e o
 * usuário é reconferido no banco — assim remover um usuário invalida o acesso.
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

  return user ?? null;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/");
  return user;
}
