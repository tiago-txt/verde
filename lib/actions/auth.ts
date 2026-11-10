"use server";

import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { endSession, startSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email("E-mail inválido"),
  senha: z.string().min(1, "Informe a senha").max(200),
  next: z.string().optional(),
});

export type LoginState = { error?: string };

type Attempt = { count: number; resetAt: number };

const attempts = new Map<string, Attempt>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 5 * 60 * 1000;

function isThrottled(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(key: string): void {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  entry.count += 1;
}

function safeNextPath(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export async function loginAction(
  _prevState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
    next: formData.get("next") ?? undefined,
  });

  if (!parsed.success) {
    return { error: "Informe um e-mail e uma senha válidos." };
  }

  const { email, senha, next } = parsed.data;

  if (isThrottled(email)) {
    return {
      error: "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    };
  }

  const user = getDb()
    .select()
    .from(users)
    .where(eq(users.email, email))
    .get();

  const senhaValida = user ? await compare(senha, user.senhaHash) : false;

  if (!user || !senhaValida) {
    registerFailure(email);
    return { error: "E-mail ou senha incorretos." };
  }

  attempts.delete(email);

  await startSession({
    userId: user.id,
    email: user.email,
    nome: user.nome,
    isAdmin: user.isAdmin,
  });

  redirect(safeNextPath(next));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
