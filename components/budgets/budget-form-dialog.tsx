"use client";

import { useEffect, useMemo, useState } from "react";
import { Controller, useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2, Search, X } from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { CategoryIcon } from "@/components/category-icon";
import { MonthPicker } from "@/components/calendar/month-picker";
import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { CurrencyInput } from "@/components/currency-input";
import { FieldError, FormError } from "@/components/form-feedback";
import type {
  BudgetFormData,
  BudgetWithCategories,
} from "@/lib/db/queries/budgets";
import {
  createBudgetSchema,
  type BudgetFormValues,
} from "@/lib/validation/budgets";
import { formatMonthTitle } from "@/lib/format";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type BudgetFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: BudgetWithCategories | null;
  formData: BudgetFormData;
  ciclo: string;
  onSubmit: (
    values: BudgetFormValues,
    relevantChange: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
};

function defaultValues(
  budget: BudgetWithCategories | null,
  formData: BudgetFormData,
  ciclo: string,
): BudgetFormValues {
  if (budget) {
    return {
      nome: budget.nome,
      valorPadrao: budget.valorPadrao,
      diaFechamento: budget.diaFechamento,
      antecedenciaCiclos: budget.antecedenciaCiclos === 1 ? 1 : 0,
      origens: budget.origens,
      cartaoId: budget.cartaoId,
      categoriaIds: budget.categories.map((category) => category.id),
      contaId: budget.contaId,
      cor: budget.cor,
      icone: budget.icone as BudgetFormValues["icone"],
      dataInicio: budget.dataInicio,
      dataFim: budget.dataFim,
    };
  }

  return {
    nome: "",
    valorPadrao: 50000,
    diaFechamento: 1,
    antecedenciaCiclos: 0,
    origens: "todas",
    cartaoId: null,
    categoriaIds: [],
    contaId: formData.defaultAccountId,
    cor: "#34d399",
    icone: "Target",
    dataInicio: ciclo,
    dataFim: null,
  };
}

function relevantChange(
  budget: BudgetWithCategories,
  values: BudgetFormValues,
): boolean {
  if (budget.valorPadrao !== values.valorPadrao) return true;
  if (budget.diaFechamento !== values.diaFechamento) return true;
  if (budget.dataInicio !== values.dataInicio) return true;
  if ((budget.dataFim ?? null) !== (values.dataFim ?? null)) return true;
  if ((budget.cartaoId ?? null) !== (values.cartaoId ?? null)) return true;
  if (budget.origens !== values.origens) return true;

  const before = budget.categories.map((category) => category.id).sort();
  const after = [...values.categoriaIds].sort();
  return (
    before.length !== after.length ||
    before.some((id, index) => id !== after[index])
  );
}

export function BudgetFormDialog({
  open,
  onOpenChange,
  budget,
  formData,
  ciclo,
  onSubmit,
}: BudgetFormDialogProps) {
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const form = useForm<BudgetFormValues>({
    resolver: zodResolver(createBudgetSchema) as Resolver<BudgetFormValues>,
    defaultValues: defaultValues(budget, formData, ciclo),
  });
  const { control, register, handleSubmit, reset, watch, formState } = form;
  const categoriaIds = watch("categoriaIds");
  const cor = watch("cor");
  const icone = watch("icone");
  const antecedencia = watch("antecedenciaCiclos");
  const diaFechamento = watch("diaFechamento");

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSearch("");
    reset(defaultValues(budget, formData, ciclo));
  }, [open, budget, formData, ciclo, reset]);

  const categories = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return formData.categories;
    return formData.categories.filter((category) =>
      category.nome.toLowerCase().includes(query),
    );
  }, [formData.categories, search]);

  const SelectedIcon = getIcon(icone);

  async function submit(values: BudgetFormValues) {
    setError(null);
    const result = await onSubmit(
      values,
      budget ? relevantChange(budget, values) : true,
    );
    if (!result.ok) {
      setError(result.error ?? "Não foi possível salvar o orçamento.");
      return;
    }
    onOpenChange(false);
  }

  const noCategories = categoriaIds.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[var(--verde-sheet-max-h,92dvh)] overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-[640px]">
        <form
          onSubmit={handleSubmit(submit)}
          className="flex max-h-[var(--verde-sheet-max-h,92dvh)] flex-col sm:max-h-[90dvh]"
        >
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>

          <DialogHeader className="border-b border-border px-4 py-3 pr-12 sm:px-5">
            <DialogTitle className="text-base sm:text-lg">
              {budget ? "Editar orçamento" : "Novo orçamento"}
            </DialogTitle>
            <p className="text-xs text-muted-foreground">
              Ciclo de {formatMonthTitle(ciclo)} ·{" "}
              {`fecha dia ${
                Number.isFinite(diaFechamento) ? diaFechamento : "—"
              }`}
            </p>
          </DialogHeader>

          <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
            <FormError message={error} />

            <div className="space-y-1">
              <Label htmlFor="budget-nome" className="text-xs text-muted-foreground">
                Nome
              </Label>
              <Input
                id="budget-nome"
                placeholder="Ex.: Cartão Nu"
                autoComplete="off"
                aria-invalid={Boolean(formState.errors.nome)}
                {...register("nome")}
              />
              <FieldError message={formState.errors.nome?.message} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label
                  htmlFor="budget-valor"
                  className="text-xs text-muted-foreground"
                >
                  Valor por ciclo
                </Label>
                <Controller
                  control={control}
                  name="valorPadrao"
                  render={({ field }) => (
                    <CurrencyInput
                      id="budget-valor"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={Boolean(formState.errors.valorPadrao)}
                    />
                  )}
                />
                <FieldError message={formState.errors.valorPadrao?.message} />
              </div>

              <div className="space-y-1">
                <Label
                  htmlFor="budget-fechamento"
                  className="text-xs text-muted-foreground"
                >
                  Dia de fechamento
                </Label>
                <Input
                  id="budget-fechamento"
                  type="number"
                  min={1}
                  max={31}
                  inputMode="numeric"
                  aria-invalid={Boolean(formState.errors.diaFechamento)}
                  {...register("diaFechamento", { valueAsNumber: true })}
                />
                <FieldError message={formState.errors.diaFechamento?.message} />
              </div>
            </div>

            {formData.cards.length > 0 && (
              <div className="space-y-1">
                <Label
                  htmlFor="budget-cartao"
                  className="text-xs text-muted-foreground"
                >
                  Cartão vinculado (opcional)
                </Label>
                <Controller
                  control={control}
                  name="cartaoId"
                  render={({ field }) => (
                    <NativeSelect
                      id="budget-cartao"
                      value={field.value ?? ""}
                      onChange={(event) => {
                        const id = event.target.value || null;
                        field.onChange(id);
                        const card = formData.cards.find(
                          (item) => item.id === id,
                        );
                        if (card) {
                          form.setValue("diaFechamento", card.diaFechamento, {
                            shouldValidate: true,
                            shouldDirty: true,
                          });
                        }
                      }}
                    >
                      <option value="">Não vincular</option>
                      {formData.cards
                        .filter((card) => !card.arquivado)
                        .map((card) => (
                          <option key={card.id} value={card.id}>
                            {card.nome} (fecha {card.diaFechamento}, vence{" "}
                            {card.diaVencimento})
                          </option>
                        ))}
                    </NativeSelect>
                  )}
                />
                <p className="text-[11px] text-muted-foreground">
                  Usa o fechamento e o vencimento do cartão na reserva e na
                  fatura. Mudanças futuras no cartão não reescrevem ciclos
                  passados deste orçamento.
                </p>
              </div>
            )}

            <div className="space-y-1">
              <Label
                htmlFor="budget-origens"
                className="text-xs text-muted-foreground"
              >
                Origens que consomem
              </Label>
              <Controller
                control={control}
                name="origens"
                render={({ field }) => (
                  <NativeSelect
                    id="budget-origens"
                    value={field.value}
                    onChange={(event) => field.onChange(event.target.value)}
                  >
                    <option value="todas">Todas</option>
                    <option value="cartao">Somente cartão</option>
                    <option value="contas">Somente contas</option>
                  </NativeSelect>
                )}
              />
              <p className="text-[11px] text-muted-foreground">
                Despesas em conta e cartão contam igualmente; use para separar
                o dinheiro físico.
              </p>
            </div>

            <div className="space-y-1">
              <Label
                htmlFor="budget-categorias"
                className="text-xs text-muted-foreground"
              >
                Categorias sincronizadas
              </Label>
              <div className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  id="budget-categorias"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar categoria"
                  className="pl-9"
                  autoComplete="off"
                />
              </div>

              <div className="grid max-h-60 grid-cols-4 gap-1.5 overflow-y-auto rounded-xl border border-border p-2 sm:grid-cols-6">
                {categories.length === 0 ? (
                  <p className="col-span-full px-2 py-3 text-xs text-muted-foreground">
                    Nenhuma categoria de despesa encontrada.
                  </p>
                ) : (
                  categories.map((category) => {
                    const checked = categoriaIds.includes(category.id);
                    const blocked =
                      Boolean(category.blockedBy) &&
                      category.blockedByBudgetId !== budget?.id &&
                      !checked;
                    return (
                      <button
                        key={category.id}
                        type="button"
                        role="checkbox"
                        aria-checked={checked}
                        disabled={blocked}
                        title={
                          blocked
                            ? `Já está no orçamento "${category.blockedBy}". Edite esse orçamento para liberar a categoria.`
                            : undefined
                        }
                        onClick={() => {
                          const current = form.getValues("categoriaIds");
                          form.setValue(
                            "categoriaIds",
                            checked
                              ? current.filter((id) => id !== category.id)
                              : [...current, category.id],
                            { shouldValidate: true, shouldDirty: true },
                          );
                        }}
                        className={cn(
                          "relative flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors",
                          checked
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border hover:border-primary/40 hover:bg-accent",
                          blocked && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <CategoryIcon
                          icon={category.icone}
                          color={category.cor}
                          className="h-9 w-9"
                          iconClassName="h-4 w-4"
                        />
                        <span className="line-clamp-2 text-[11px] leading-tight">
                          {category.nome}
                        </span>
                        {blocked && (
                          <span className="text-[9px] text-muted-foreground">
                            em {category.blockedBy}
                          </span>
                        )}
                        {checked && (
                          <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              {noCategories && (
                <p className="text-xs text-warning">
                  Escolha pelo menos uma categoria de despesa.
                </p>
              )}
              {categories.some(
                (category) =>
                  category.blockedBy &&
                  category.blockedByBudgetId !== budget?.id &&
                  !categoriaIds.includes(category.id),
              ) && (
                <p className="text-[11px] text-muted-foreground">
                  Categorias acinzentadas já estão em outro orçamento ativo.
                  Edite esse orçamento para liberá-las.
                </p>
              )}
              <FieldError message={formState.errors.categoriaIds?.message} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label
                  htmlFor="budget-conta"
                  className="text-xs text-muted-foreground"
                >
                  Conta da reserva
                </Label>
                <Controller
                  control={control}
                  name="contaId"
                  render={({ field }) => (
                    <NativeSelect
                      id="budget-conta"
                      value={field.value ?? ""}
                      onChange={(event) =>
                        field.onChange(event.target.value || null)
                      }
                    >
                      <option value="">Conta principal</option>
                      {formData.accounts.map((account) => (
                        <option
                          key={account.id}
                          value={account.id}
                          disabled={
                            account.arquivada && account.id !== field.value
                          }
                        >
                          {account.nome}
                          {account.arquivada ? " (arquivada)" : ""}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Antecedência
                </Label>
                <div className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border px-3">
                  <span className="text-xs">1 ciclo antes</span>
                  <Controller
                    control={control}
                    name="antecedenciaCiclos"
                    render={({ field }) => (
                      <Switch
                        checked={antecedencia === 1}
                        onCheckedChange={(checked) =>
                          field.onChange(checked ? 1 : 0)
                        }
                        aria-label="Provisionar com 1 ciclo de antecedência"
                      />
                    )}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Início</Label>
                <MonthPicker
                  month={watch("dataInicio")}
                  onChange={(month) =>
                    form.setValue("dataInicio", month, {
                      shouldValidate: true,
                      shouldDirty: true,
                    })
                  }
                  className="w-full justify-start border border-input bg-background px-3 text-sm font-normal"
                />
                <FieldError message={formState.errors.dataInicio?.message} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">
                  Fim (opcional)
                </Label>
                <div className="flex gap-1">
                  <MonthPicker
                    month={watch("dataFim") ?? watch("dataInicio")}
                    empty={!watch("dataFim")}
                    placeholder="Sem data final"
                    onChange={(month) =>
                      form.setValue("dataFim", month, {
                        shouldValidate: true,
                        shouldDirty: true,
                      })
                    }
                    className="w-full justify-start border border-input bg-background px-3 text-sm font-normal"
                  />
                  {watch("dataFim") && (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 shrink-0"
                      onClick={() =>
                        form.setValue("dataFim", null, {
                          shouldValidate: true,
                          shouldDirty: true,
                        })
                      }
                      aria-label="Remover data final"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                <FieldError message={formState.errors.dataFim?.message} />
              </div>
            </div>

            <details className="rounded-md border border-border">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 text-xs font-medium text-muted-foreground">
                <SelectedIcon
                  className="h-4 w-4"
                  style={{ color: cor }}
                  aria-hidden="true"
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
                      <ColorPicker
                        value={field.value}
                        onChange={field.onChange}
                      />
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
                        value={field.value}
                        onChange={field.onChange}
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
            <Button type="submit" disabled={formState.isSubmitting || noCategories}>
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
