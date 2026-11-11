"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupAction, type SignupState } from "@/lib/actions/users";

export function SignupForm() {
  const [state, formAction, isPending] = useActionState<SignupState, FormData>(
    signupAction,
    {},
  );
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{state.error}</span>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="cadastro-nome">Nome</Label>
        <Input
          id="cadastro-nome"
          name="nome"
          autoComplete="name"
          required
          minLength={2}
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cadastro-email">E-mail</Label>
        <Input
          id="cadastro-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          disabled={isPending}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cadastro-senha">Senha</Label>
        <div className="relative">
          <Input
            id="cadastro-senha"
            name="senha"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={10}
            className="pr-12"
            disabled={isPending}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
            className="absolute inset-y-0 right-0 grid h-11 w-11 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Pelo menos 10 caracteres, com letras e números.
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Criando conta…
          </>
        ) : (
          <>
            <UserPlus className="h-4 w-4" />
            Criar conta
          </>
        )}
      </Button>
    </form>
  );
}
