"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2, Save, Trash2 } from "lucide-react";import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  changePasswordAction,
  deleteOwnAccountAction,
  updateProfileAction,
} from "@/lib/actions/users";

type Feedback = { tone: "error" | "success"; message: string } | null;

function Feedback({ feedback }: { feedback: Feedback }) {
  if (!feedback) return null;
  return (
    <p
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
      <span>{feedback.message}</span>
    </p>
  );
}

export function ProfileSettings({
  nome,
  email,
}: {
  nome: string;
  email: string;
}) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await updateProfileAction({
        nome: String(formData.get("nome") ?? ""),
        email: String(formData.get("email") ?? ""),
      });
      setFeedback(
        result.ok
          ? { tone: "success", message: "Perfil atualizado." }
          : { tone: "error", message: result.error },
      );
      if (result.ok) router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Feedback feedback={feedback} />
      <div className="space-y-2">
        <Label htmlFor="perfil-nome">Nome</Label>
        <Input
          id="perfil-nome"
          name="nome"
          defaultValue={nome}
          required
          minLength={2}
          maxLength={120}
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="perfil-email">E-mail</Label>
        <Input
          id="perfil-email"
          name="email"
          type="email"
          defaultValue={email}
          required
          disabled={pending}
        />
      </div>
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        Salvar perfil
      </Button>
    </form>
  );
}

export function PasswordSettings({ forced = false }: { forced?: boolean }) {
  const router = useRouter();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    startTransition(async () => {
      const result = await changePasswordAction({
        senhaAtual: String(formData.get("senhaAtual") ?? ""),
        novaSenha: String(formData.get("novaSenha") ?? ""),
      });
      if (result.ok) {
        form.reset();
        setFeedback({ tone: "success", message: "Senha alterada." });
        if (forced) router.replace("/");
      } else {
        setFeedback({ tone: "error", message: result.error });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Feedback feedback={feedback} />
      <div className="space-y-2">
        <Label htmlFor="senha-atual">Senha atual</Label>
        <Input
          id="senha-atual"
          name="senhaAtual"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nova-senha">Nova senha</Label>
        <Input
          id="nova-senha"
          name="novaSenha"
          type="password"
          autoComplete="new-password"
          required
          minLength={10}
          disabled={pending}
        />
        <p className="text-xs text-muted-foreground">
          Pelo menos 10 caracteres, com letras e números.
        </p>
      </div>
      <Button type="submit" disabled={pending} className="h-11">
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {forced ? "Definir nova senha" : "Alterar senha"}
      </Button>
    </form>
  );
}

export function DeleteAccountSettings() {
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      const result = await deleteOwnAccountAction({
        senha: String(formData.get("senha") ?? ""),
        confirmacao: String(formData.get("confirmacao") ?? ""),
      });
      if (result && !result.ok) {
        setFeedback({ tone: "error", message: result.error });
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Feedback feedback={feedback} />
      <div className="space-y-2">
        <Label htmlFor="excluir-senha">Senha</Label>
        <Input
          id="excluir-senha"
          name="senha"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="excluir-confirmacao">
          Digite <strong>EXCLUIR</strong> para confirmar
        </Label>
        <Input
          id="excluir-confirmacao"
          name="confirmacao"
          required
          placeholder="EXCLUIR"
          disabled={pending}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Isso apaga permanentemente seu workspace e todos os seus dados
        financeiros. Exporte um backup JSON antes, se quiser guardar uma cópia.
      </p>
      <Button
        type="submit"
        variant="destructive"
        disabled={pending}
        className="h-11"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
        Excluir minha conta
      </Button>
    </form>
  );
}
