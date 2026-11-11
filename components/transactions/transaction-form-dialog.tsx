"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ArrowRight,
  Check,
  ChevronDown,
  CopyPlus,
  Loader2,
  Paperclip,
  Repeat,
  StickyNote,
  Tags as TagsIcon,
  Target,
  Trash2,
  type LucideIcon,
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
import { useToast } from "@/components/ui/toast";
import { CategorySelect } from "./category-select";
import { CurrencyInput } from "@/components/currency-input";
import { DatePicker } from "@/components/calendar/date-picker";
import { FieldError, FormError } from "@/components/form-feedback";
import {
  createTransactionAction,
  updateTransactionAction,
} from "@/lib/actions/transactions";
import {
  getBudgetHintAction,
  type BudgetHint,
} from "@/lib/actions/budgets";
import type {
  RecentDescription,
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
import { formatCurrency } from "@/lib/format";
import { useSheetViewport } from "@/lib/hooks/use-sheet-viewport";
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

  const lastAccount = formData.accounts.find(
    (account) => account.id === formData.lastAccountId && !account.arquivada,
  );
  const firstAccount =
    lastAccount ??
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

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="text-xs font-medium text-muted-foreground"
    >
      {children}
    </Label>
  );
}

function AdvancedChip({
  icon: Icon,
  label,
  active,
  open,
  onClick,
  disabled,
  title,
  dot,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
  open?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  dot?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={disabled ? undefined : open}
      aria-label={title ?? label}
      title={title}
      className={cn(
        "flex h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-8",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent",
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="max-w-[170px] truncate">{label}</span>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
    </button>
  );
}

function Accordion({
  open,
  children,
}: {
  open: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-200 ease-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      aria-hidden={!open}
    >
      <div className="overflow-hidden">
        <div
          className="mt-2 rounded-lg border border-border bg-muted/20 p-3"
          inert={!open}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

type TransactionFormDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  transaction?: TransactionListItem | null;
  scope?: Scope;
  formData: TransactionFormData;
  onSaved: () => void;
  onRequestDelete?: (transaction: TransactionListItem) => void;
};

export function TransactionFormDialog({
  open,
  onOpenChange,
  mode,
  transaction = null,
  scope = "single",
  formData,
  onSaved,
  onRequestDelete,
}: TransactionFormDialogProps) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const [descriptionOpen, setDescriptionOpen] = useState(false);
  const [accountTouched, setAccountTouched] = useState(false);
  const [activeChip, setActiveChip] = useState<
    "repetir" | "obs" | "tags" | null
  >(null);
  const [budgetHint, setBudgetHint] = useState<BudgetHint | null>(null);
  const skipConfirmRef = useRef(false);
  const { toast } = useToast();

  useSheetViewport(open);

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
  const frequencia = watch("frequencia");
  const contaId = watch("contaId");
  const categoriaId = watch("categoriaId");
  const tagIds = watch("tagIds");
  const observacao = watch("observacao");
  const descricao = watch("descricao");
  const pago = watch("pago");
  // Lido no render para o react-hook-form assinar as mudanças de estado sujo.
  const isDirty = formState.isDirty;

  const isGrouped = Boolean(
    transaction?.recorrenciaId || transaction?.parcelaGrupoId,
  );
  const isInstallment = Boolean(transaction?.parcelaGrupoId);
  const canChangeType = mode === "create" || !isGrouped;
  const canChangeDate = mode === "create" || !isGrouped;
  const paidLocked = mode === "edit" && isGrouped && scope !== "single";

  useEffect(() => {
    if (!open) return;
    skipConfirmRef.current = false;
    setServerError(null);
    setActiveChip(null);
    setConfirmCloseOpen(false);
    setDescriptionOpen(false);
    setAccountTouched(false);
    reset(buildDefaults(transaction, formData, mode));
  }, [open, transaction, formData, mode, reset]);

  const categoryOptions = formData.categories.filter(
    (category) =>
      category.tipo === tipo &&
      (!category.deletedAt || category.id === categoriaId),
  );

  const suggestions = useMemo(() => {
    const query = descricao.trim().toLowerCase();
    if (!query) return [];
    return formData.recentDescriptions
      .filter((item) => item.descricao.toLowerCase().includes(query))
      .slice(0, 5);
  }, [descricao, formData.recentDescriptions]);

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
        total: installmentTotal(plan),
        first: plan[0]?.valor ?? 0,
        rest: plan[1]?.valor ?? plan[0]?.valor ?? 0,
      };
    } catch {
      return null;
    }
  }, [repeticao, valor, parcelas, data, baseValor]);

  const obsHasValue = Boolean(observacao?.trim());
  const tagsHasValue = tagIds.length > 0;

  useEffect(() => {
    if (!open || tipo !== "despesa") {
      setBudgetHint(null);
      return;
    }

    const effectiveCategoryId =
      categoriaId ??
      formData.categories.find(
        (category) => category.isSystem && category.tipo === "despesa",
      )?.id ??
      null;

    if (!effectiveCategoryId) {
      setBudgetHint(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void getBudgetHintAction({
        categoriaId: effectiveCategoryId,
        data,
        excludeTransactionId: transaction?.id ?? null,
      })
        .then((hint) => {
          if (!cancelled) setBudgetHint(hint);
        })
        .catch(() => {
          if (!cancelled) setBudgetHint(null);
        });
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, tipo, categoriaId, data, transaction?.id, formData.categories]);

  const repetitionChipLabel =
    mode === "edit"
      ? isInstallment
        ? `Parcela ${transaction?.parcelaAtual}/${transaction?.parcelaTotal}`
        : "Recorrente"
      : repeticao === "fixa"
        ? `Fixa · ${frequencia}`
        : repeticao === "parcelada"
          ? `Parcela 1/${parcelas || "?"}`
          : "Repetir";

  function handleTypeChange(next: TransactionType) {
    setValue("tipo", next, { shouldValidate: true });
    setValue("categoriaId", null);
    setValue("contaDestinoId", null);
    if (next === "transferencia" && repeticao === "parcelada") {
      setValue("repeticao", "nenhuma");
    }
  }

  function toggleChip(chip: "repetir" | "obs" | "tags") {
    setActiveChip((current) => (current === chip ? null : chip));
  }

  function applySuggestion(suggestion: RecentDescription) {
    setValue("descricao", suggestion.descricao, {
      shouldDirty: true,
      shouldValidate: true,
    });

    if (!categoriaId && suggestion.categoriaId) {
      const category = formData.categories.find(
        (item) => item.id === suggestion.categoriaId && !item.deletedAt,
      );
      if (category) {
        setValue("categoriaId", category.id, { shouldValidate: true });
      }
    }

    if (valor === 0 && suggestion.valor > 0) {
      setValue("valor", suggestion.valor, { shouldValidate: true });
    }

    if (!accountTouched && suggestion.contaId) {
      const account = formData.accounts.find(
        (item) => item.id === suggestion.contaId && !item.arquivada,
      );
      if (account) setValue("contaId", account.id);
    }

    setDescriptionOpen(false);
  }

  async function persist(values: TransactionFormValues, keepOpen: boolean) {
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

    if (result.budgetNotice) {
      toast({
        description: result.budgetNotice.message,
        tone: result.budgetNotice.tone,
      });
    }

    if (mode === "edit") {
      skipConfirmRef.current = true;
      onOpenChange(false);
      onSaved();
      return;
    }

    if (keepOpen) {
      reset(buildDefaults(null, formData, "create"));
      setActiveChip(null);
      setServerError(null);
      onSaved();
      requestAnimationFrame(() => {
        document.getElementById("transaction-valor")?.focus();
      });
      return;
    }

    skipConfirmRef.current = true;
    onOpenChange(false);
    onSaved();
  }

  const onSubmit = handleSubmit((values) => persist(values, false));
  const onSubmitAndNew = handleSubmit((values) => persist(values, true));

  function handleOpenChange(next: boolean) {
    if (next) {
      onOpenChange(true);
      return;
    }

    if (skipConfirmRef.current) {
      skipConfirmRef.current = false;
      onOpenChange(false);
      return;
    }

    if (isDirty && !formState.isSubmitting) {
      setConfirmCloseOpen(true);
      return;
    }

    onOpenChange(false);
  }

  function handleFormKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      if (mode === "create") void onSubmitAndNew();
      else void onSubmit();
      return;
    }

    if (event.key !== "Enter" || event.shiftKey || event.defaultPrevented) {
      return;
    }

    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.tagName === "TEXTAREA") return;
    if (
      target.tagName === "BUTTON" ||
      target.tagName === "A" ||
      target.getAttribute("role") === "button"
    ) {
      return;
    }

    event.preventDefault();
    void onSubmit();
  }

  const hasAccounts = formData.accounts.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="max-h-[var(--verde-sheet-max-h,92dvh)] overflow-hidden p-0 sm:max-h-[90dvh] sm:max-w-[700px]"
        showClose
      >
        <form
          onSubmit={onSubmit}
          onKeyDown={handleFormKeyDown}
          className="flex max-h-[var(--verde-sheet-max-h,92dvh)] flex-col sm:max-h-[90dvh]"
        >
          <div className="flex justify-center pt-2 sm:hidden">
            <span className="h-1 w-10 rounded-full bg-border" />
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 pr-12 sm:flex-nowrap sm:gap-3 sm:px-5 sm:py-3">
            <DialogHeader className="min-w-0 flex-1">
              <DialogTitle className="text-base sm:text-lg">
                {mode === "edit" ? "Editar lançamento" : "Novo lançamento"}
              </DialogTitle>
              {mode === "edit" && isGrouped && (
                <p className="text-xs text-muted-foreground">
                  Escopo: {SCOPE_LABELS[scope]}
                </p>
              )}
            </DialogHeader>

            {canChangeType ? (
              <div
                role="tablist"
                aria-label="Tipo de lançamento"
                className="order-3 flex w-full gap-0.5 rounded-md bg-muted p-0.5 sm:order-2 sm:w-auto"
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
                      "h-10 flex-1 rounded px-2 text-xs font-medium transition-colors sm:h-8 sm:flex-none sm:px-3",
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
              <Badge
                variant={TYPE_BADGE[tipo]}
                className="order-3 sm:order-2"
              >
                {TYPE_LABELS[tipo]}
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4 sm:p-5">
            <FormError message={serverError} />

            {!hasAccounts && (
              <div className="mb-3 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs text-warning">
                Cadastre uma conta antes de lançar.{" "}
                <Link href="/contas" className="font-medium underline">
                  Criar conta
                </Link>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
              <div className="col-span-2 space-y-1 sm:col-span-6">
                <FieldLabel htmlFor="transaction-descricao">
                  Descrição
                </FieldLabel>
                <div className="relative">
                  <Input
                    id="transaction-descricao"
                    placeholder={
                      tipo === "transferencia"
                        ? "Transferência para poupança"
                        : "Ex.: Mercado do mês"
                    }
                    autoComplete="off"
                    aria-invalid={Boolean(formState.errors.descricao)}
                    onFocus={() => setDescriptionOpen(true)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.ctrlKey &&
                        !event.metaKey &&
                        descriptionOpen &&
                        suggestions[0]
                      ) {
                        event.preventDefault();
                        applySuggestion(suggestions[0]);
                      }
                    }}
                    {...register("descricao", {
                      onBlur: () =>
                        window.setTimeout(
                          () => setDescriptionOpen(false),
                          150,
                        ),
                    })}
                  />

                  {descriptionOpen && suggestions.length > 0 && (
                    <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-lg">
                      {suggestions.map((suggestion) => (
                        <button
                          key={`${suggestion.descricao}-${suggestion.valor}`}
                          type="button"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applySuggestion(suggestion)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {suggestion.descricao}
                            {suggestion.categoriaNome && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {suggestion.categoriaNome}
                              </span>
                            )}
                          </span>
                          <span className="tabular text-xs text-muted-foreground">
                            {formatCurrency(suggestion.valor)}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <FieldError message={formState.errors.descricao?.message} />
              </div>

              <div className="col-span-1 space-y-1 sm:col-span-2">
                <FieldLabel htmlFor="transaction-valor">
                  {isInstallment ? "Valor da parcela" : "Valor"}
                </FieldLabel>
                <Controller
                  control={control}
                  name="valor"
                  render={({ field }) => (
                    <CurrencyInput
                      id="transaction-valor"
                      value={field.value}
                      onChange={field.onChange}
                      large
                      autoFocus
                      aria-invalid={Boolean(formState.errors.valor)}
                    />
                  )}
                />
                <FieldError message={formState.errors.valor?.message} />
              </div>

              <div className="col-span-1 space-y-1 sm:col-span-2">
                <FieldLabel htmlFor="transaction-data">Data</FieldLabel>
                <Controller
                  control={control}
                  name="data"
                  render={({ field }) => (
                    <DatePicker
                      id="transaction-data"
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!canChangeDate}
                      aria-invalid={Boolean(formState.errors.data)}
                    />
                  )}
                />
                <FieldError message={formState.errors.data?.message} />
              </div>

              <div className="col-span-2 space-y-1 sm:col-span-2">
                <FieldLabel htmlFor="transaction-pago">Pago</FieldLabel>
                <div
                  className="flex h-14 items-center justify-between gap-2 rounded-md border border-border px-3"
                  title={
                    paidLocked
                      ? "O status é mantido ao editar vários lançamentos"
                      : undefined
                  }
                >
                  <span className="text-sm font-medium">
                    {pago ? "Pago" : "Não pago"}
                  </span>
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
              </div>

              {tipo === "transferencia" ? (
                <div className="col-span-2 grid grid-cols-[1fr_auto_1fr] items-end gap-2 sm:col-span-6">
                  <div className="space-y-1">
                    <FieldLabel htmlFor="transaction-conta">Origem</FieldLabel>
                    <NativeSelect
                      id="transaction-conta"
                      aria-invalid={Boolean(formState.errors.contaId)}
                      {...register("contaId", {
                        onChange: () => setAccountTouched(true),
                      })}
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

                  <ArrowRight
                    className="mb-3 h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />

                  <div className="space-y-1">
                    <FieldLabel htmlFor="transaction-destino">
                      Destino
                    </FieldLabel>
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
                </div>
              ) : (
                <>
                  <div className="col-span-2 space-y-1 sm:col-span-3">
                    <FieldLabel htmlFor="transaction-conta">Conta</FieldLabel>
                    <NativeSelect
                      id="transaction-conta"
                      aria-invalid={Boolean(formState.errors.contaId)}
                      {...register("contaId", {
                        onChange: () => setAccountTouched(true),
                      })}
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

                  <div className="col-span-2 space-y-1 sm:col-span-3">
                    <FieldLabel htmlFor="transaction-categoria">
                      Categoria
                    </FieldLabel>
                    <Controller
                      control={control}
                      name="categoriaId"
                      render={({ field }) => (
                        <CategorySelect
                          id="transaction-categoria"
                          options={categoryOptions}
                          value={field.value}
                          onChange={field.onChange}
                          disabled={formState.isSubmitting}
                        />
                      )}
                    />
                    <FieldError
                      message={formState.errors.categoriaId?.message}
                    />
                    {budgetHint && (
                      <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2 py-1.5 text-[11px] text-muted-foreground">
                        <Target
                          className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>
                          Orçamento{" "}
                          <span className="font-medium text-foreground">
                            {budgetHint.nome}
                          </span>{" "}
                          · restam {formatCurrency(budgetHint.restante)}
                          {valor > budgetHint.restante && (
                            <span className="font-medium text-destructive">
                              {" "}
                              · Vai estourar em{" "}
                              {formatCurrency(valor - budgetHint.restante)}
                            </span>
                          )}
                        </span>
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="col-span-2 flex items-center gap-2 overflow-x-auto pb-0.5 sm:col-span-6">
                {(mode === "create" || isGrouped) && (
                  <AdvancedChip
                    icon={Repeat}
                    label={repetitionChipLabel}
                    active={
                      mode === "edit" || repeticao !== "nenhuma"
                    }
                    open={activeChip === "repetir"}
                    onClick={() => toggleChip("repetir")}
                    disabled={mode === "edit"}
                    title={
                      mode === "edit"
                        ? "A recorrência é alterada pelo escopo escolhido"
                        : "Repetir"
                    }
                  />
                )}
                <AdvancedChip
                  icon={StickyNote}
                  label="Obs."
                  active={obsHasValue}
                  open={activeChip === "obs"}
                  onClick={() => toggleChip("obs")}
                  dot={obsHasValue}
                  title="Observação"
                />
                <AdvancedChip
                  icon={TagsIcon}
                  label={tagsHasValue ? `${tagIds.length} tags` : "Tags"}
                  active={tagsHasValue}
                  open={activeChip === "tags"}
                  onClick={() => toggleChip("tags")}
                  title="Tags"
                />
                <AdvancedChip
                  icon={Paperclip}
                  label="Anexo · em breve"
                  disabled
                  title="Anexo (em breve)"
                />
              </div>

              <div className="col-span-2 sm:col-span-6">
                {mode === "create" && (
                  <Accordion open={activeChip === "repetir"}>
                    <div className="space-y-2">
                      <div className="grid grid-cols-3 gap-1.5">
                        {(
                          ["nenhuma", "fixa", "parcelada"] as const
                        ).map((option) => (
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
                              "h-9 rounded-md border px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                              repeticao === option
                                ? "border-primary/50 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {REPETITION_LABELS[option]}
                          </button>
                        ))}
                      </div>

                      {repeticao === "fixa" && (
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <FieldLabel htmlFor="transaction-frequencia">
                              Frequência
                            </FieldLabel>
                            <NativeSelect
                              id="transaction-frequencia"
                              className="h-10"
                              {...register("frequencia")}
                            >
                              <option value="mensal">Mensal</option>
                              <option value="semanal">Semanal</option>
                              <option value="anual">Anual</option>
                            </NativeSelect>
                          </div>
                          <div className="space-y-1">
                            <FieldLabel htmlFor="transaction-data-fim">
                              Data final
                            </FieldLabel>
                            <Controller
                              control={control}
                              name="dataFim"
                              render={({ field }) => (
                                <DatePicker
                                  id="transaction-data-fim"
                                  value={field.value ?? ""}
                                  onChange={(iso) =>
                                    field.onChange(iso || null)
                                  }
                                  className="h-10"
                                />
                              )}
                            />
                            <FieldError
                              message={formState.errors.dataFim?.message}
                            />
                          </div>
                        </div>
                      )}

                      {repeticao === "parcelada" && (
                        <div className="space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <FieldLabel htmlFor="transaction-parcelas">
                                Parcelas
                              </FieldLabel>
                              <Input
                                id="transaction-parcelas"
                                type="number"
                                min={2}
                                max={60}
                                inputMode="numeric"
                                className="h-10"
                                {...register("parcelas", {
                                  valueAsNumber: true,
                                })}
                              />
                              <FieldError
                                message={formState.errors.parcelas?.message}
                              />
                            </div>
                            <div className="space-y-1">
                              <FieldLabel>Valor é</FieldLabel>
                              <div className="grid grid-cols-2 gap-1">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setValue("baseValor", "total", {
                                      shouldValidate: true,
                                    })
                                  }
                                  className={cn(
                                    "h-10 rounded-md border px-1 text-xs font-medium",
                                    baseValor === "total"
                                      ? "border-primary/50 bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground hover:bg-accent",
                                  )}
                                >
                                  Total
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setValue("baseValor", "parcela", {
                                      shouldValidate: true,
                                    })
                                  }
                                  className={cn(
                                    "h-10 rounded-md border px-1 text-xs font-medium",
                                    baseValor === "parcela"
                                      ? "border-primary/50 bg-primary/10 text-primary"
                                      : "border-border text-muted-foreground hover:bg-accent",
                                  )}
                                >
                                  Parcela
                                </button>
                              </div>
                            </div>
                          </div>

                          {installmentPreview ? (
                            <p className="text-xs text-muted-foreground">
                              {parcelas}x de{" "}
                              {formatCurrency(installmentPreview.rest)}
                              {installmentPreview.first !==
                                installmentPreview.rest &&
                                ` (1ª ${formatCurrency(installmentPreview.first)})`}{" "}
                              · total{" "}
                              {formatCurrency(installmentPreview.total)}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              Informe valor e parcelas válidos.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </Accordion>
                )}

                <Accordion open={activeChip === "obs"}>
                  <div className="space-y-1">
                    <FieldLabel htmlFor="transaction-observacao">
                      Observação
                    </FieldLabel>
                    <Textarea
                      id="transaction-observacao"
                      placeholder="Opcional"
                      maxLength={1000}
                      className="min-h-[72px]"
                      {...register("observacao")}
                    />
                    <FieldError
                      message={formState.errors.observacao?.message}
                    />
                  </div>
                </Accordion>

                <Accordion open={activeChip === "tags"}>
                  {formData.tags.length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma tag.{" "}
                      <Link
                        href="/configuracoes/categorias"
                        className="underline hover:text-foreground"
                      >
                        Criar tags
                      </Link>
                    </p>
                  ) : (
                    <Controller
                      control={control}
                      name="tagIds"
                      render={({ field }) => (
                        <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
                          {formData.tags.map((tag) => {
                            const checked = field.value.includes(tag.id);
                            return (
                              <label
                                key={tag.id}
                                htmlFor={`transaction-tag-${tag.id}`}
                                className={cn(
                                  "flex h-9 cursor-pointer items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors",
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
                </Accordion>
              </div>
            </div>
          </div>

          <div className="border-t border-border px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:px-5 sm:py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                {mode === "edit" && transaction && onRequestDelete && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Excluir lançamento"
                    title="Excluir lançamento"
                    onClick={() => onRequestDelete(transaction)}
                    disabled={formState.isSubmitting}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}

                {mode === "create" && (
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-11 gap-1.5 px-2 text-xs sm:h-9"
                    onClick={() => void onSubmitAndNew()}
                    disabled={formState.isSubmitting || !hasAccounts}
                  >
                    {formState.isSubmitting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CopyPlus className="h-3.5 w-3.5" />
                    )}
                    Salvar e criar outro
                  </Button>
                )}

                <span className="hidden whitespace-nowrap text-[10px] text-muted-foreground sm:inline">
                  Enter salva · Ctrl/Cmd+Enter{" "}
                  {mode === "create" ? "cria outro" : "salva"}
                </span>
              </div>

              <Button
                type="submit"
                className="min-w-[140px]"
                disabled={formState.isSubmitting || !hasAccounts}
              >
                {formState.isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Salvar
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>

      <Dialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Descartar lançamento?</DialogTitle>
            <DialogDescription>
              Há dados preenchidos que ainda não foram salvos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmCloseOpen(false)}
            >
              Continuar editando
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmCloseOpen(false);
                skipConfirmRef.current = true;
                onOpenChange(false);
              }}
            >
              Descartar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
