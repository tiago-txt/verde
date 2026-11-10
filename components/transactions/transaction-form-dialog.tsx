"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowLeftRight,
  CalendarClock,
  Loader2,
  Repeat,
  Tags as TagsIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { CategoryPicker } from "./category-picker";
import { CurrencyInput } from "@/components/currency-input";
import { FieldError, FormError } from "@/components/form-feedback";
import {
  createTransactionAction,
  updateTransactionAction,
} from "@/lib/actions/transactions";
import type {
  TransactionFormData,
  TransactionListItem,
} from "@/lib/db/queries/transactions";
import type { TransactionType } from "@/lib/db/schema";
import { todayISO } from "@/lib/dates";
import {
  buildInstallmentPlan,
  installmentTotal,
} from "@/lib/finance/installments";
import type { Scope } from "@/lib/finance/scopes";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  createTransactionSchema,
  type TransactionFormValues,
} from "@/lib/validation/transactions";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<TransactionType, string> = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
};

const TYPE_BADGE: Record<
  TransactionType,
  "destructive" | "success" | "secondary"
> = {
  despesa: "destructive",
  receita: "success",
  transferencia: "secondary",
};

const SCOPE_LABELS: Record<Scope, string> = {
  single: "só este",
  future: "este e os próximos",
  all: "todos",
};

const REPETITION_LABELS = {
  nenhuma: "Não repetir",
  fixa: "Fixa",
  parcelada: "Parcelada",
} as const;

function buildDefaults(
  transaction: TransactionListItem | null,
  formData: TransactionFormData,
  mode: "create" | "edit",
): TransactionFormValues {
  if (mode === "edit" && transaction) {
    return {
      tipo: transaction.tipo,
      descricao: transaction.descricao,
      valor: transaction.valor,
      data: transaction.data,
      pago: transaction.pago,
      contaId: transaction.contaId ?? "",
      contaDestinoId: transaction.contaDestinoId,
      categoriaId: transaction.categoriaId,
      tagIds: transaction.tags.map((tag) => tag.id),
      observacao: transaction.observacao ?? "",
      repeticao: "nenhuma",
      frequencia: "mensal",
      dataFim: null,
      parcelas: 2,
      baseValor: "total",
    };
  }

  const firstAccount =
    formData.accounts.find((account) => !account.arquivada) ??
    formData.accounts[0];

  return {
    tipo: "despesa",
    descricao: "",
    valor: 0,
    data: todayISO(),
    pago: true,
    contaId: firstAccount?.id ?? "",
    contaDestinoId: null,
    categoriaId: null,
    tagIds: [],
    observacao: "",
    repeticao: "nenhuma",
    frequencia: "mensal",
    dataFim: null,
    parcelas: 2,
    baseValor: "total",
  };
}

type TransactionFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  transaction?: TransactionListItem | null;
  scope?: Scope;
  formData: TransactionFormData;
  onSaved: () => void;
};

export function TransactionFormDialog({
  open,
  onOpenChange,
  mode,
  transaction = null,
  scope = "single",
  formData,
  onSaved,
}: TransactionFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<TransactionFormValues>({
    resolver: zodResolver(createTransactionSchema),
    defaultValues: buildDefaults(transaction, formData, mode),
  });

  const { register, control, handleSubmit, reset, watch, setValue, formState } =
    form;

  const tipo = watch("tipo");
  const repeticao = watch("repeticao");
  const valor = watch("valor");
  const data = watch("data");
  const parcelas = watch("parcelas");
  const baseValor = watch("baseValor");
  const contaId = watch("contaId");
  const categoriaId = watch("categoriaId");

  const isGrouped = Boolean(
    transaction?.recorrenciaId || transaction?.parcelaGrupoId,
  );
  const isInstallment = Boolean(transaction?.parcelaGrupoId);
  const canChangeType = mode === "create" || !isGrouped;
  const canChangeDate = mode === "create" || !isGrouped;
  const paidLocked = mode === "edit" && isGrouped && scope !== "single";

  useEffect(() => {
    if (!open) return;
    setServerError(null);
    reset(buildDefaults(transaction, formData, mode));
  }, [open, transaction, formData, mode, reset]);

  const categoryOptions = formData.categories.filter(
    (category) =>
      category.tipo === tipo &&
      (!category.deletedAt || category.id === categoriaId),
  );

  const installmentPreview = useMemo(() => {
    if (repeticao !== "parcelada") return null;
    try {
      const plan = buildInstallmentPlan({
        valorCents: valor,
        parcelas,
        dataInicio: data,
        baseValor,
      });
      return {
        plan,
        total: installmentTotal(plan),
        first: plan[0]?.valor ?? 0,
        rest: plan[1]?.valor ?? plan[0]?.valor ?? 0,
      };
    } catch {
      return null;
    }
  }, [repeticao, valor, parcelas, data, baseValor]);

  function handleTypeChange(next: TransactionType) {
    setValue("tipo", next, { shouldValidate: true });
    setValue("categoriaId", null);
    setValue("contaDestinoId", null);
    if (next === "transferencia" && repeticao === "parcelada") {
      setValue("repeticao", "nenhuma");
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);

    if (formData.accounts.length === 0) {
      setServerError("Cadastre uma conta antes de criar lançamentos.");
      return;
    }

    const result =
      mode === "edit" && transaction
        ? await updateTransactionAction({
            ...values,
            id: transaction.id,
            scope,
          })
        : await createTransactionAction(values);

    if (!result.ok) {
      setServerError(result.error);
      return;
    }

    onOpenChange(false);
    onSaved();
  });

  const hasAccounts = formData.accounts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92dvh] overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-2xl"
        showClose
      >
        <form onSubmit={onSubmit} className="flex max-h-[92dvh] flex-col sm:max-h-[90dvh]">
          <div className="border-b border-border p-5 pr-12 sm:p-6 sm:pr-14">
            <DialogHeader>
              <DialogTitle>
                {mode === "edit" ? "Editar lançamento" : "Novo lançamento"}
              </DialogTitle>
              <DialogDescription>
                {mode === "edit"
                  ? "Ajuste os dados do lançamento."
                  : "Registre uma despesa, receita ou transferência entre contas."}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-6">
            <FormError message={serverError} />

            {!hasAccounts && (
              <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                Você precisa de pelo menos uma conta.{" "}
                <Link href="/contas" className="font-medium underline">
                  Cadastrar conta
                </Link>
                .
              </div>
            )}

            {mode === "edit" && isGrouped && (
              <div className="rounded-lg border border-primary/25 bg-primary/10 p-3 text-sm">
                <p className="flex items-center gap-2 font-medium text-primary">
                  <Repeat className="h-4 w-4" />
                  {isInstallment
                    ? `Parcela ${transaction?.parcelaAtual}/${transaction?.parcelaTotal}`
                    : "Lançamento recorrente"}
                </p>
                <p className="mt-1 text-muted-foreground">
                  Editando <strong className="text-foreground">{SCOPE_LABELS[scope]}</strong>.
                  Data e tipo ficam bloqueados para não quebrar o cronograma.
                </p>
              </div>
            )}

            {canChangeType ? (
              <div
                role="tablist"
                aria-label="Tipo de lançamento"
                className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
              >
                {(
                  ["despesa", "receita", "transferencia"] as TransactionType[]
                ).map((type) => (
                  <button
                    key={type}
                    type="button"
                    role="tab"
                    aria-selected={tipo === type}
                    onClick={() => handleTypeChange(type)}
                    className={cn(
                      "min-h-11 rounded-md px-2 text-sm font-medium transition-colors",
                      tipo === type
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {TYPE_LABELS[type]}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Badge variant={TYPE_BADGE[tipo]}>{TYPE_LABELS[tipo]}</Badge>
                <span className="text-xs text-muted-foreground">
                  tipo não editável
                </span>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="transaction-descricao">Descrição</Label>
              <Input
                id="transaction-descricao"
                placeholder={
                  tipo === "transferencia"
                    ? "Ex.: Transferência para poupança"
                    : "Ex.: Mercado do mês"
                }
                autoFocus
                aria-invalid={Boolean(formState.errors.descricao)}
                {...register("descricao")}
              />
              <FieldError message={formState.errors.descricao?.message} />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transaction-valor">
                  {isInstallment ? "Valor da parcela" : "Valor"}
                </Label>
                <Controller
                  control={control}
                  name="valor"
                  render={({ field }) => (
                    <CurrencyInput
                      id="transaction-valor"
                      value={field.value}
                      onChange={field.onChange}
                      aria-invalid={Boolean(formState.errors.valor)}
                    />
                  )}
                />
                <FieldError message={formState.errors.valor?.message} />
                <p className="text-xs text-muted-foreground">
                  Digite os centavos: 123456 = R$ 1.234,56
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="transaction-data">Data</Label>
                <Input
                  id="transaction-data"
                  type="date"
                  disabled={!canChangeDate}
                  aria-invalid={Boolean(formState.errors.data)}
                  {...register("data")}
                />
                <FieldError message={formState.errors.data?.message} />
                {!canChangeDate && (
                  <p className="text-xs text-muted-foreground">
                    Data bloqueada ao editar vários lançamentos.
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border p-3">
              <div>
                <Label htmlFor="transaction-pago">Lançamento pago</Label>
                <p className="text-xs text-muted-foreground">
                  {paidLocked
                    ? "O status de pagamento é mantido ao editar vários lançamentos."
                    : repeticao === "fixa"
                      ? "Aplica-se à primeira ocorrência; as próximas ficam não pagas."
                      : repeticao === "parcelada"
                        ? "Aplica-se à primeira parcela; as demais ficam não pagas."
                        : "Marque se o dinheiro já entrou ou saiu."}
                </p>
              </div>
              <Controller
                control={control}
                name="pago"
                render={({ field }) => (
                  <Switch
                    id="transaction-pago"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={paidLocked}
                  />
                )}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="transaction-conta">
                  {tipo === "transferencia" ? "Conta de origem" : "Conta"}
                </Label>
                <NativeSelect
                  id="transaction-conta"
                  aria-invalid={Boolean(formState.errors.contaId)}
                  {...register("contaId")}
                >
                  {!hasAccounts && <option value="">Nenhuma conta</option>}
                  {formData.accounts.map((account) => (
                    <option
                      key={account.id}
                      value={account.id}
                      disabled={account.arquivada && account.id !== contaId}
                    >
                      {account.nome}
                      {account.arquivada ? " (arquivada)" : ""}
                    </option>
                  ))}
                </NativeSelect>
                <FieldError message={formState.errors.contaId?.message} />
              </div>

              {tipo === "transferencia" && (
                <div className="space-y-2">
                  <Label htmlFor="transaction-destino">Conta de destino</Label>
                  <Controller
                    control={control}
                    name="contaDestinoId"
                    render={({ field }) => (
                      <NativeSelect
                        id="transaction-destino"
                        value={field.value ?? ""}
                        onChange={(event) =>
                          field.onChange(event.target.value || null)
                        }
                        aria-invalid={Boolean(
                          formState.errors.contaDestinoId,
                        )}
                      >
                        <option value="">Selecione</option>
                        {formData.accounts
                          .filter((account) => account.id !== contaId)
                          .map((account) => (
                            <option
                              key={account.id}
                              value={account.id}
                              disabled={
                                account.arquivada &&
                                account.id !== field.value
                              }
                            >
                              {account.nome}
                              {account.arquivada ? " (arquivada)" : ""}
                            </option>
                          ))}
                      </NativeSelect>
                    )}
                  />
                  <FieldError
                    message={formState.errors.contaDestinoId?.message}
                  />
                </div>
              )}
            </div>

            {tipo !== "transferencia" && (
              <div className="space-y-2">
                <Label>Categoria</Label>
                <Controller
                  control={control}
                  name="categoriaId"
                  render={({ field }) => (
                    <CategoryPicker
                      options={categoryOptions}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={formState.isSubmitting}
                    />
                  )}
                />
                <FieldError message={formState.errors.categoriaId?.message} />
              </div>
            )}

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <TagsIcon className="h-4 w-4 text-muted-foreground" />
                Tags
              </Label>
              {formData.tags.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma tag cadastrada. Crie em{" "}
                  <Link
                    href="/configuracoes/categorias"
                    className="underline hover:text-foreground"
                  >
                    Configurações &gt; Categorias
                  </Link>
                  .
                </p>
              ) : (
                <Controller
                  control={control}
                  name="tagIds"
                  render={({ field }) => (
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map((tag) => {
                        const checked = field.value.includes(tag.id);
                        return (
                          <label
                            key={tag.id}
                            htmlFor={`transaction-tag-${tag.id}`}
                            className={cn(
                              "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3 text-sm transition-colors",
                              checked
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border hover:bg-accent",
                            )}
                          >
                            <Checkbox
                              id={`transaction-tag-${tag.id}`}
                              checked={checked}
                              onCheckedChange={(value) => {
                                field.onChange(
                                  value
                                    ? [...field.value, tag.id]
                                    : field.value.filter(
                                        (tagId) => tagId !== tag.id,
                                      ),
                                );
                              }}
                            />
                            {tag.nome}
                          </label>
                        );
                      })}
                    </div>
                  )}
                />
              )}
              <FieldError message={formState.errors.tagIds?.message} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="transaction-observacao">Observação</Label>
              <Textarea
                id="transaction-observacao"
                placeholder="Opcional"
                maxLength={1000}
                {...register("observacao")}
              />
              <FieldError message={formState.errors.observacao?.message} />
            </div>

            {mode === "create" && (
              <div className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Repeat className="h-4 w-4 text-primary" />
                  Repetição
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {(["nenhuma", "fixa", "parcelada"] as const).map(
                    (option) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() =>
                          setValue("repeticao", option, {
                            shouldValidate: true,
                          })
                        }
                        disabled={
                          option === "parcelada" &&
                          tipo === "transferencia"
                        }
                        className={cn(
                          "min-h-11 rounded-md border px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                          repeticao === option
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        {REPETITION_LABELS[option]}
                      </button>
                    ),
                  )}
                </div>

                {repeticao === "fixa" && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="transaction-frequencia">
                          Frequência
                        </Label>
                        <NativeSelect
                          id="transaction-frequencia"
                          {...register("frequencia")}
                        >
                          <option value="mensal">Mensal</option>
                          <option value="semanal">Semanal</option>
                          <option value="anual">Anual</option>
                        </NativeSelect>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="transaction-data-fim">
                          Data final (opcional)
                        </Label>
                        <Controller
                          control={control}
                          name="dataFim"
                          render={({ field }) => (
                            <Input
                              id="transaction-data-fim"
                              type="date"
                              min={data}
                              value={field.value ?? ""}
                              onChange={(event) =>
                                field.onChange(event.target.value || null)
                              }
                            />
                          )}
                        />
                        <FieldError
                          message={formState.errors.dataFim?.message}
                        />
                      </div>
                    </div>
                    <p className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      A primeira ocorrência é {formatDate(data)}. As próximas
                      são geradas automaticamente (até 12 meses à frente) e
                      ficam não pagas.
                    </p>
                  </div>
                )}

                {repeticao === "parcelada" && (
                  <div className="space-y-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="transaction-parcelas">
                          Número de parcelas
                        </Label>
                        <Input
                          id="transaction-parcelas"
                          type="number"
                          min={2}
                          max={60}
                          inputMode="numeric"
                          {...register("parcelas", {
                            valueAsNumber: true,
                          })}
                        />
                        <FieldError
                          message={formState.errors.parcelas?.message}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>O valor informado é</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setValue("baseValor", "total", {
                                shouldValidate: true,
                              })
                            }
                            className={cn(
                              "min-h-11 rounded-md border px-2 text-xs font-medium",
                              baseValor === "total"
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-accent",
                            )}
                          >
                            O total (dividir)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setValue("baseValor", "parcela", {
                                shouldValidate: true,
                              })
                            }
                            className={cn(
                              "min-h-11 rounded-md border px-2 text-xs font-medium",
                              baseValor === "parcela"
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-accent",
                            )}
                          >
                            Cada parcela
                          </button>
                        </div>
                      </div>
                    </div>

                    {installmentPreview ? (
                      <div className="rounded-md bg-muted/50 p-3 text-sm">
                        <p className="font-medium">
                          {parcelas}x de{" "}
                          {formatCurrency(installmentPreview.rest)}
                          {installmentPreview.first !==
                            installmentPreview.rest && (
                            <span className="text-muted-foreground">
                              {" "}
                              (1ª de{" "}
                              {formatCurrency(installmentPreview.first)})
                            </span>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Total: {formatCurrency(installmentPreview.total)} · 1ª
                          parcela em {formatDate(data)}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Informe um valor e um número de parcelas válidos.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {mode === "edit" && !isGrouped && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <ArrowLeftRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Este lançamento não faz parte de uma recorrência nem de um
                parcelamento.
              </p>
            )}
          </div>

          <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-6">
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={formState.isSubmitting}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={formState.isSubmitting || !hasAccounts}
              >
                {formState.isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                {mode === "edit" ? "Salvar alterações" : "Criar lançamento"}
              </Button>
            </DialogFooter>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
