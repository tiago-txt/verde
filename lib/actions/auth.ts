"use server";

import { compare } from "bcryptjs";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
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

async function clientIp(): Promise<string> {
  const headerStore = await headers();
  const forwarded = headerStore.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headerStore.get("x-real-ip")?.trim() || "local";
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
  const ip = await clientIp();
  const emailKey = `email:${email}`;
  const ipKey = `ip:${ip}`;

  if (isThrottled(emailKey) || isThrottled(ipKey)) {
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

  // Mensagem genérica: não revela se o e-mail existe, está inativo ou a senha
  // está errada.
  if (!user || !senhaValida || !user.ativo) {
    registerFailure(emailKey);
    registerFailure(ipKey);
    return { error: "E-mail ou senha incorretos." };
  }

  attempts.delete(emailKey);
  attempts.delete(ipKey);

  getDb()
    .update(users)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, user.id))
    .run();

  await startSession({
    userId: user.id,
    workspaceId: user.workspaceId,
    role: user.role,
    email: user.email,
    nome: user.nome,
    isAdmin: user.role === "admin",
  });

  redirect(user.mustChangePassword ? "/trocar-senha" : safeNextPath(next));
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect("/login");
}
