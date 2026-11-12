"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { CurrencyInput } from "@/components/currency-input";
import { FieldError, FormError } from "@/components/form-feedback";
import type { CreditCard } from "@/lib/db/schema";
import { CARD_BRANDS } from "@/lib/db/schema";
import { createCardSchema, type CardFormValues } from "@/lib/validation/cards";
import { resolveEntityIcon } from "@/lib/icon-selection";
import { EntityTile } from "@/components/entity-tile";

type CardAccountOption = {
  id: string;
  nome: string;
  arquivada: boolean;
};

type CardFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: CreditCard | null;
  accounts: CardAccountOption[];
  onSubmit: (
    values: CardFormValues,
  ) => Promise<{ ok: boolean; error?: string }>;
};

const BRAND_LABELS: Record<(typeof CARD_BRANDS)[number], string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "Amex",
  hipercard: "Hipercard",
  outra: "Outra",
};

function defaults(
  card: CreditCard | null,
  accounts: CardAccountOption[],
): CardFormValues {
  if (card) {
    return {
      nome: card.nome,
      bandeira: card.bandeira as CardFormValues["bandeira"],
      limite: card.limite,
      diaFechamento: card.diaFechamento,
      diaVencimento: card.diaVencimento,
      fechamentoCompra: card.fechamentoCompra,
      contaPagamentoId: card.contaPagamentoId,
      cor: card.cor,
      icone: resolveEntityIcon(card.icone, "CreditCard"),
    };
  }

  const account =
    accounts.find((item) => !item.arquivada) ?? accounts[0] ?? null;

  return {
    nome: "",
    bandeira: "visa",
    limite: 100000,
    diaFechamento: 1,
    diaVencimento: 10,
    fechamentoCompra: "proxima_fatura",
    contaPagamentoId: account?.id ?? null,
    cor: "#818cf8",
    icone: "CreditCard",
  };
}

export function CardFormDialog({
  open,
  onOpenChange,
  card,
  accounts,
  onSubmit,
}: CardFormDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CardFormValues>({
    resolver: zodResolver(createCardSchema),
    defaultValues: defaults(card, accounts),
  });
  const { control, register, handleSubmit, reset, watch, formState } = form;
  const cor = watch("cor");
  const icone = watch("icone");

  useEffect(() => {
    if (!open) return;
    setError(null);
    reset(defaults(card, accounts));
  }, [open, card, accounts, reset]);

  async function submit(values: CardFormValues) {
    setError(null);
    const result = await onSubmit(values);
    if (!result.ok) {
      setError(result.error ?? "Não foi possível salvar o cartão.");
      return;
    }
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[var(--verde-sheet-max-h,92dvh)] overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-[560px]">
        <form
          onSubmit={handleSubmit(submit)}
          className="flex max-h-[var(--verde-sheet-max-h,92dvh)] flex-col sm:max-h-[90dvh]"
        >
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>

          <DialogHeader className="border-b border-border px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="text-base sm:text-lg">
              {card ? "Editar cartão" : "Novo cartão"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Defina fechamento, vencimento e a regra para compras no dia do
              fechamento.
            </p>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
            <FormError message={error} />

            <div className="space-y-1">
              <Label htmlFor="card-nome" className="text-xs text-muted-foreground">
                Nome
              </Label>
              <Input
                id="card-nome"
                placeholder="Ex.: Nu"
                autoComplete="off"
                aria-invalid={Boolean(formState.errors.nome)}
                {...register("nome")}
              />
              <FieldError message={formState.errors.nome?.message} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label
                  htmlFor="card-bandeira"
                  className="text-xs text-muted-foreground"
                >
                  Bandeira
                </Label>
                <NativeSelect id="card-bandeira" {...register("bandeira")}>
                  {CARD_BRANDS.map((brand) => (
                    <option key={brand} value={brand}>
                      {BRAND_LABELS[brand]}
                    </option>
                  ))}
                </NativeSelect>
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="card-limite"
                  className="text-xs text-muted-foreground"
                >
                  Limite
                </Label>
                <Controller
                  control={control}
                  name="limite"
                  render={({ field }) => (
                    <CurrencyInput
                      id="card-limite"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={Boolean(formState.errors.limite)}
                    />
                  )}
                />
                <FieldError message={formState.errors.limite?.message} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label
                  htmlFor="card-fechamento"
                  className="text-xs text-muted-foreground"
                >
                  Dia de fechamento
                </Label>
                <Input
                  id="card-fechamento"
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  aria-invalid={Boolean(formState.errors.diaFechamento)}
                  {...register("diaFechamento", { valueAsNumber: true })}
                />
                <FieldError message={formState.errors.diaFechamento?.message} />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="card-vencimento"
                  className="text-xs text-muted-foreground"
                >
                  Dia de vencimento
                </Label>
                <Input
                  id="card-vencimento"
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  aria-invalid={Boolean(formState.errors.diaVencimento)}
                  {...register("diaVencimento", { valueAsNumber: true })}
                />
                <FieldError message={formState.errors.diaVencimento?.message} />
              </div>
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="card-fechamento-compra"
                className="text-xs text-muted-foreground"
              >
                Compra no dia do fechamento entra
              </Label>
              <NativeSelect
                id="card-fechamento-compra"
                {...register("fechamentoCompra")}
              >
                <option value="proxima_fatura">Na próxima fatura</option>
                <option value="fatura_atual">Nesta fatura</option>
              </NativeSelect>
              <p className="text-xs text-muted-foreground">
                Muda a fatura (e o ciclo de orçamento) apenas das compras feitas
                exatamente no dia do fechamento.
              </p>
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="card-conta"
                className="text-xs text-muted-foreground"
              >
                Conta de pagamento
              </Label>
              <Controller
                control={control}
                name="contaPagamentoId"
                render={({ field }) => (
                  <NativeSelect
                    id="card-conta"
                    value={field.value ?? ""}
                    onChange={(event) =>
                      field.onChange(event.target.value || null)
                    }
                  >
                    <option value="">Definir depois</option>
                    {accounts.map((account) => (
                      <option
                        key={account.id}
                        value={account.id}
                        disabled={account.arquivada && account.id !== field.value}
                      >
                        {account.nome}
                        {account.arquivada ? " (arquivada)" : ""}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              />
            </div>

            <details className="rounded-md border border-border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
                <EntityTile
                  kind="cartao"
                  entity={{ nome: "Cartão", cor, icone }}
                  size="xs"
                />
                Aparência
                <span
                  className="ml-auto h-3 w-3 rounded-full border border-border"
                  style={{ backgroundColor: cor }}
                />
              </summary>
              <div className="space-y-3 border-t border-border p-3">
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Cor</p>
                  <Controller
                    control={control}
                    name="cor"
                    render={({ field }) => (
                      <ColorPicker value={field.value} onChange={field.onChange} />
                    )}
                  />
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">Ícone</p>
                  <Controller
                    control={control}
                    name="icone"
                    render={({ field }) => (
                      <IconPicker
                        kind="cartao"
                        allowBanks
                        value={field.value}
                        defaultTab={card ? undefined : "banks"}
                        onChange={(icon, bank) => {
                          field.onChange(icon);
                          if (!bank) return;
                          const currentColor = form.getValues("cor");
                          if (!card || currentColor === "#818cf8") {
                            form.setValue("cor", bank.brandColor, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }
                        }}
                      />
                    )}
                  />
                </div>
              </div>
            </details>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={formState.isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Salvar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
