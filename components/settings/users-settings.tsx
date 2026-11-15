"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  UserCheck,
  UserX,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import type { AdminUserRow } from "@/lib/db/queries/users";
import {
  createDemoAccountAction,
  createUserAction,
  deleteUserAction,
  resetUserPasswordAction,
  setUserActiveAction,
} from "@/lib/actions/users";
import { formatDateTime } from "@/lib/format";

type Feedback = { tone: "error" | "success"; message: string } | null;

export function UsersSettings({
  users,
  currentUserId,
}: {
  users: AdminUserRow[];
  currentUserId: string;
}) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [pending, startTransition] = useTransition();
  const [demo, setDemo] = useState<{ email: string; senha: string } | null>(
    null,
  );
  const [demoPending, startDemoTransition] = useTransition();
  const router = useRouter();

  function createDemo() {
    setFeedback(null);
    startDemoTransition(async () => {
      const result = await createDemoAccountAction();
      if (!result.ok) {
        setFeedback({ tone: "error", message: result.error });
        return;
      }
      setDemo({ email: result.email, senha: result.senha });
      setFeedback({
        tone: "success",
        message: "Conta demo criada. Compartilhe as credenciais com o testador.",
      });
      router.refresh();
    });
  }

  async function copyDemoCredentials() {
    if (!demo) return;
    try {
      await navigator.clipboard.writeText(`${demo.email}\n${demo.senha}`);
      setFeedback({
        tone: "success",
        message: "Credenciais copiadas.",
      });
    } catch {
      setFeedback({
        tone: "error",
        message: "Não foi possível copiar. Selecione e copie manualmente.",
      });
    }
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await createUserAction({
        nome: String(formData.get("nome") ?? ""),
        email: String(formData.get("email") ?? ""),
        senha: String(formData.get("senha") ?? "") || undefined,
        role: String(formData.get("role") ?? "membro") as "admin" | "membro",
      });
      if (result.ok) {
        form.reset();
        setShowCreate(false);
        setFeedback({
          tone: "success",
          message: result.notice?.message ?? "Usuário criado.",
        });
        router.refresh();
      } else {
        setFeedback({ tone: "error", message: result.error });
      }
    });
  }

  function resetPassword(user: AdminUserRow) {
    startTransition(async () => {
      const result = await resetUserPasswordAction(user.id);
      setFeedback(
        result.ok
          ? {
              tone: "success",
              message: result.notice?.message ?? "Senha redefinida.",
            }
          : { tone: "error", message: result.error },
      );
      if (result.ok) router.refresh();
    });
  }

  function toggleActive(user: AdminUserRow) {
    startTransition(async () => {
      const result = await setUserActiveAction({
        id: user.id,
        ativo: !user.ativo,
      });
      setFeedback(
        result.ok
          ? {
              tone: "success",
              message: user.ativo ? "Usuário desativado." : "Usuário ativado.",
            }
          : { tone: "error", message: result.error },
      );
      if (result.ok) router.refresh();
    });
  }

  function remove(user: AdminUserRow) {
    const confirmation = window.prompt(
      `Excluir ${user.nome} e TODOS os dados financeiros dele? Digite o e-mail (${user.email}) para confirmar.`,
    );
    if (confirmation === null) return;
    startTransition(async () => {
      const result = await deleteUserAction({
        id: user.id,
        confirmacao: confirmation,
      });
      setFeedback(
        result.ok
          ? { tone: "success", message: "Usuário e workspace excluídos." }
          : { tone: "error", message: result.error },
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          role={feedback.tone === "error" ? "alert" : "status"}
          className={
            feedback.tone === "error"
              ? "flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "flex items-start gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary"
          }
        >
          {feedback.tone === "error" ? (
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span className="break-words">{feedback.message}</span>
        </div>
      )}

      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="tile grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 space-y-1">
              <p className="font-medium">Conta de demonstração</p>
              <p className="text-sm text-muted-foreground">
                Cria um workspace isolado com 3 meses de dados de exemplo,
                recorrências, cartões e faturas. Ideal para enviar a testadores.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="h-11"
            onClick={createDemo}
            disabled={demoPending}
          >
            {demoPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Criar conta demo
          </Button>
        </div>

        {demo && (
          <div className="space-y-2 rounded-lg border border-grout bg-forest-container/40 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">E-mail</p>
                <p className="font-mono text-sm break-all">{demo.email}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Senha</p>
                <p className="font-mono text-sm">{demo.senha}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11"
                onClick={() => void copyDemoCredentials()}
              >
                <Copy className="h-4 w-4" />
                Copiar credenciais
              </Button>
              <Button asChild variant="ghost" size="sm" className="h-11">
                <Link href="/login">Abrir login</Link>
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Cada clique cria uma conta separada. Use uma por testador para
              evitar que eles compartilhem as mesmas alterações.
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {users.length} usuário(s). Cada um tem um workspace isolado.
        </p>
        <Button
          type="button"
          onClick={() => setShowCreate((value) => !value)}
          className="h-11"
        >
          <Plus className="h-4 w-4" />
          {showCreate ? "Fechar" : "Novo usuário"}
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2"
        >
          <div className="space-y-2">
            <Label htmlFor="novo-nome">Nome</Label>
            <Input id="novo-nome" name="nome" required minLength={2} disabled={pending} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="novo-email">E-mail</Label>
            <Input
              id="novo-email"
              name="email"
              type="email"
              required
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="novo-senha">Senha temporária (opcional)</Label>
            <Input
              id="novo-senha"
              name="senha"
              type="text"
              autoComplete="new-password"
              placeholder="Gerada automaticamente"
              disabled={pending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="novo-role">Papel</Label>
            <NativeSelect id="novo-role" name="role" defaultValue="membro" disabled={pending}>
              <option value="membro">Membro</option>
              <option value="admin">Administrador</option>
            </NativeSelect>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={pending} className="h-11">
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Criar usuário
            </Button>
          </div>
        </form>
      )}

      <ul className="space-y-2">
        {users.map((user) => {
          const isSelf = user.id === currentUserId;
          return (
            <li
              key={user.id}
              className="rounded-xl border border-border bg-card p-3 sm:p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{user.nome}</p>
                    {user.role === "admin" && (
                      <Badge variant="default">
                        <ShieldCheck className="mr-1 h-3 w-3" />
                        Administrador
                      </Badge>
                    )}
                    {isSelf && <Badge variant="secondary">Você</Badge>}
                    <Badge variant={user.ativo ? "success" : "secondary"}>
                      {user.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                    {user.mustChangePassword && (
                      <Badge variant="warning">Troca de senha pendente</Badge>
                    )}
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user.workspaceNome} · criado em {formatDateTime(user.createdAt)}
                    {user.lastLoginAt
                      ? ` · último acesso ${formatDateTime(user.lastLoginAt)}`
                      : " · nunca acessou"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11"
                    disabled={pending}
                    onClick={() => resetPassword(user)}
                  >
                    <KeyRound className="h-4 w-4" />
                    Redefinir senha
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-11"
                    disabled={pending || isSelf}
                    onClick={() => toggleActive(user)}
                  >
                    {user.ativo ? (
                      <UserX className="h-4 w-4" />
                    ) : (
                      <UserCheck className="h-4 w-4" />
                    )}
                    {user.ativo ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    className="h-11"
                    disabled={pending || isSelf}
                    onClick={() => remove(user)}
                  >
                    <Trash2 className="h-4 w-4" />
                    Excluir
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
