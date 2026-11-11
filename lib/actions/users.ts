"use server";

import { randomBytes } from "node:crypto";
import { compare, hashSync } from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin, requireSessionUser, requireUser } from "@/lib/auth/current-user";
import { endSession, startSession } from "@/lib/auth/session";
import { scopedDb } from "@/lib/db/scoped";
import { users, workspaces } from "@/lib/db/schema";
import {
  countActiveAdmins,
  getUserByEmail,
  getUserById,
} from "@/lib/db/queries/users";
import { seedWorkspaceDefaults, workspaceNameFor } from "@/lib/db/seed-workspace";
import {
  changePasswordSchema,
  createUserSchema,
  deleteAccountSchema,
  signupSchema,
  updateProfileSchema,
  type ChangePasswordInput,
  type CreateUserInput,
  type DeleteAccountInput,
  type SignupInput,
  type UpdateProfileInput,
} from "@/lib/validation/users";
import type { ActionResult } from "./result";

export type SignupState = { error?: string };
export type PasswordState = { error?: string; ok?: boolean };

function fail(error: string): ActionResult {
  return { ok: false, error };
}

/** Senha temporária legível, com letras e números, usada no primeiro acesso. */
function generateTemporaryPassword(): string {
  return `${randomBytes(8).toString("base64url")}7a`;
}

function revalidateUsers() {
  revalidatePath("/configuracoes/usuarios");
}

export async function createUserAction(
  input: CreateUserInput,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = createUserSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const { nome, email, role } = parsed.data;
  if (getUserByEmail(email)) {
    return fail("Já existe um usuário com esse e-mail.");
  }

  const senha = parsed.data.senha ?? generateTemporaryPassword();
  const workspaceId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const { db } = scopedDb(workspaceId);

  try {
    db.transaction((tx) => {
      tx.insert(workspaces)
        .values({ id: workspaceId, nome: workspaceNameFor(nome) })
        .run();
      tx.insert(users)
        .values({
          id: userId,
          workspaceId,
          nome,
          email,
          senhaHash: hashSync(senha, 12),
          role,
          isAdmin: role === "admin",
          ativo: true,
          mustChangePassword: true,
        })
        .run();
    });

    seedWorkspaceDefaults(db, workspaceId);
  } catch (error) {
    console.error("[verde] erro ao criar usuário:", error);
    try {
      db.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
    } catch {
      // Se a limpeza falhar, o usuário continua existindo e pode ser removido
      // pela tela de Usuários.
    }
    return fail("Não foi possível criar o usuário.");
  }

  revalidateUsers();
  return {
    ok: true,
    id: userId,
    notice: {
      tone: "success",
      message: `Usuário criado. Senha temporária: ${senha}`,
    },
  };
}

export async function resetUserPasswordAction(
  id: string,
): Promise<ActionResult> {
  await requireAdmin();

  const target = getUserById(id);
  if (!target) return fail("Usuário não encontrado.");

  const senha = generateTemporaryPassword();
  const { db } = scopedDb(target.workspaceId);
  db.update(users)
    .set({
      senhaHash: hashSync(senha, 12),
      mustChangePassword: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, id))
    .run();

  revalidateUsers();
  return {
    ok: true,
    id,
    notice: {
      tone: "success",
      message: `Senha redefinida. Senha temporária: ${senha}`,
    },
  };
}

export async function setUserActiveAction(input: {
  id: string;
  ativo: boolean;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const target = getUserById(input.id);
  if (!target) return fail("Usuário não encontrado.");

  if (target.id === admin.id && !input.ativo) {
    return fail("Você não pode desativar a própria conta.");
  }

  if (target.role === "admin" && !input.ativo) {
    if (countActiveAdmins(target.id) === 0) {
      return fail("É necessário manter pelo menos um administrador ativo.");
    }
  }

  const { db } = scopedDb(target.workspaceId);
  db.update(users)
    .set({ ativo: input.ativo, updatedAt: new Date() })
    .where(eq(users.id, target.id))
    .run();

  revalidateUsers();
  return { ok: true, id: target.id };
}

export async function deleteUserAction(input: {
  id: string;
  confirmacao: string;
}): Promise<ActionResult> {
  const admin = await requireAdmin();
  const target = getUserById(input.id);
  if (!target) return fail("Usuário não encontrado.");

  if (target.id === admin.id) {
    return fail("Use “Excluir minha conta” para remover a própria conta.");
  }
  if (input.confirmacao !== target.email) {
    return fail("Digite o e-mail do usuário para confirmar a exclusão.");
  }
  if (target.role === "admin" && countActiveAdmins(target.id) === 0) {
    return fail("É necessário manter pelo menos um administrador ativo.");
  }

  const { db } = scopedDb(target.workspaceId);
  // O workspace é a raiz: apaga usuário, categorias, contas, lançamentos etc.
  db.delete(workspaces).where(eq(workspaces.id, target.workspaceId)).run();

  revalidateUsers();
  return { ok: true };
}

export async function updateProfileAction(
  input: UpdateProfileInput,
): Promise<ActionResult> {
  const user = await requireUser();

  const parsed = updateProfileSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const existing = getUserByEmail(parsed.data.email);
  if (existing && existing.id !== user.id) {
    return fail("Já existe um usuário com esse e-mail.");
  }

  const { db } = scopedDb(user.workspaceId);
  db.update(users)
    .set({
      nome: parsed.data.nome,
      email: parsed.data.email,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .run();

  revalidatePath("/configuracoes");
  return { ok: true, id: user.id };
}

export async function changePasswordAction(
  input: ChangePasswordInput,
): Promise<ActionResult> {
  const user = await requireSessionUser();

  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const valid = await compare(parsed.data.senhaAtual, user.senhaHash);
  if (!valid) return fail("A senha atual está incorreta.");

  const { db } = scopedDb(user.workspaceId);
  db.update(users)
    .set({
      senhaHash: hashSync(parsed.data.novaSenha, 12),
      mustChangePassword: false,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id))
    .run();

  revalidatePath("/configuracoes");
  return { ok: true, id: user.id };
}

export async function deleteOwnAccountAction(
  input: DeleteAccountInput,
): Promise<ActionResult> {
  const user = await requireSessionUser();

  const parsed = deleteAccountSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const valid = await compare(parsed.data.senha, user.senhaHash);
  if (!valid) return fail("Senha incorreta.");

  if (user.role === "admin" && countActiveAdmins(user.id) === 0) {
    return fail(
      "Você é o último administrador ativo. Crie outro administrador antes de excluir a conta.",
    );
  }

  const { db } = scopedDb(user.workspaceId);
  db.delete(workspaces).where(eq(workspaces.id, user.workspaceId)).run();

  await endSession();
  redirect("/login");
}

export async function signupAction(
  _prevState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  if (process.env.ALLOW_SIGNUP !== "true") {
    return { error: "O cadastro público está desabilitado neste servidor." };
  }

  const parsed = signupSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const input: SignupInput = parsed.data;
  if (getUserByEmail(input.email)) {
    return { error: "Não foi possível criar a conta com esses dados." };
  }

  const workspaceId = crypto.randomUUID();
  const userId = crypto.randomUUID();
  const { db } = scopedDb(workspaceId);

  try {
    db.transaction((tx) => {
      tx.insert(workspaces)
        .values({ id: workspaceId, nome: workspaceNameFor(input.nome) })
        .run();
      tx.insert(users)
        .values({
          id: userId,
          workspaceId,
          nome: input.nome,
          email: input.email,
          senhaHash: hashSync(input.senha, 12),
          role: "membro",
          isAdmin: false,
          ativo: true,
          mustChangePassword: false,
          lastLoginAt: new Date(),
        })
        .run();
    });
    seedWorkspaceDefaults(db, workspaceId);
  } catch (error) {
    console.error("[verde] erro no cadastro:", error);
    try {
      db.delete(workspaces).where(eq(workspaces.id, workspaceId)).run();
    } catch {
      // Limpeza best-effort.
    }
    return { error: "Não foi possível criar a conta." };
  }

  await startSession({
    userId,
    workspaceId,
    role: "membro",
    email: input.email,
    nome: input.nome,
    isAdmin: false,
  });

  redirect("/");
}
