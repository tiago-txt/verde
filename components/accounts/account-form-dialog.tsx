"use client";

import { useEffect, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toIconName } from "@/lib/icon-names";
import { Loader2 } from "lucide-react";
import type { AccountWithBalance } from "@/lib/db/queries/accounts";
import { ACCOUNT_TYPES, type AccountType } from "@/lib/db/schema";
import { DEFAULT_COLOR } from "@/lib/colors";
import { accountInputSchema, type AccountInput } from "@/lib/validation/accounts";
import { createAccountAction, updateAccountAction } from "@/lib/actions/accounts";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { CurrencyInput } from "@/components/currency-input";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { FieldError, FormError } from "@/components/form-feedback";

const TYPE_LABELS: Record<AccountType, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  dinheiro: "Dinheiro",
  investimento: "Investimento",
};

type AccountFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account?: AccountWithBalance | null;
  onSaved: () => void;
};

export function AccountFormDialog({
  open,
  onOpenChange,
  account,
  onSaved,
}: AccountFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const isMobile = useIsMobile();

  const form = useForm<AccountInput>({
    resolver: zodResolver(accountInputSchema) as Resolver<AccountInput>,
    defaultValues: {
      nome: account?.nome ?? "",
      tipo: account?.tipo ?? "corrente",
      saldoInicial: account?.saldoInicial ?? 0,
      cor: account?.cor ?? DEFAULT_COLOR,
      icone: toIconName(account?.icone, "Wallet"),
    },
  });

  const { register, control, handleSubmit, reset, formState } = form;

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    reset({
      nome: account?.nome ?? "",
      tipo: account?.tipo ?? "corrente",
      saldoInicial: account?.saldoInicial ?? 0,
      cor: account?.cor ?? DEFAULT_COLOR,
      icone: toIconName(account?.icone, "Wallet"),
    });
  }, [open, account, reset]);

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const result = account
      ? await updateAccountAction(account.id, values)
      : await createAccountAction(values);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    onOpenChange(false);
    onSaved();
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={onSubmit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{account ? "Editar conta" : "Nova conta"}</DialogTitle>
            <DialogDescription>
              O saldo inicial é o ponto de partida; os lançamentos pagos são
              somados a ele.
            </DialogDescription>
          </DialogHeader>

          <FormError message={serverError} />

          <div className="space-y-2">
            <Label htmlFor="account-nome">Nome</Label>
            <Input
              id="account-nome"
              placeholder="Ex.: Conta corrente Itaú"
              autoFocus={!isMobile}
              aria-invalid={Boolean(formState.errors.nome)}
              {...register("nome")}
            />
            <FieldError message={formState.errors.nome?.message} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-tipo">Tipo</Label>
              <NativeSelect id="account-tipo" {...register("tipo")}>
                {ACCOUNT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type]}
                  </option>
                ))}
              </NativeSelect>
              <FieldError message={formState.errors.tipo?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-saldo">Saldo inicial</Label>
              <Controller
                control={control}
                name="saldoInicial"
                render={({ field }) => (
                  <CurrencyInput
                    id="account-saldo"
                    value={field.value}
                    onChange={field.onChange}
                    signed
                    aria-invalid={Boolean(formState.errors.saldoInicial)}
                  />
                )}
              />
              <FieldError message={formState.errors.saldoInicial?.message} />
              <p className="text-xs text-muted-foreground">
                Use o botão − para saldo negativo.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Cor</Label>
            <Controller
              control={control}
              name="cor"
              render={({ field }) => (
                <ColorPicker value={field.value} onChange={field.onChange} />
              )}
            />
            <FieldError message={formState.errors.cor?.message} />
          </div>

          <div className="space-y-2">
            <Label>Ícone</Label>
            <Controller
              control={control}
              name="icone"
              render={({ field }) => (
                <IconPicker value={field.value} onChange={field.onChange} />
              )}
            />
            <FieldError message={formState.errors.icone?.message} />
          </div>

          <DialogFooter className="border-t border-border pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              {account ? "Salvar alterações" : "Criar conta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
