"use client";

import {
  useEffect,
  useMemo,
  useState,
  useOptimistic,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  MoreVertical,
  Plus,
  ReceiptText,
  X,
} from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { FormError } from "@/components/form-feedback";
import { MonthPicker } from "@/components/calendar/month-picker";
import {
  BulkActionsBar,
  BulkCategoryDialog,
  BulkDeleteDialog,
  BulkTagDialog,
} from "./bulk-actions";
import { FilterBar } from "./filter-bar";
import { ScopeDialog } from "./scope-dialog";
import { TransactionDetailsPanel } from "./transaction-details-panel";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransactionRow } from "./transaction-row";
import { BudgetEventRow } from "./budget-event-row";
import { CardInvoiceRow } from "./card-invoice-row";
import { BudgetDetailDialog } from "@/components/budgets/budget-detail-dialog";
import { TransactionsSummaryFooter } from "./transactions-summary-footer";
import { useToast } from "@/components/ui/toast";
import {
  bulkAddTagAction,
  bulkChangeCategoryAction,
  bulkDeleteTransactionsAction,
  bulkSetPaidAction,
  deleteTransactionAction,
  duplicateTransactionAction,
  setTransactionPaidAction,
} from "@/lib/actions/transactions";
import type {
  TransactionDetail,
  TransactionFormData,
  TransactionListItem,
} from "@/lib/db/queries/transactions";
import type { BudgetEventView } from "@/lib/db/queries/budgets";
import type { CardInvoiceEvent } from "@/lib/db/queries/cards";
import {
  addMonths,
  currentMonth,
  todayISO,
} from "@/lib/dates";
import type { Scope } from "@/lib/finance/scopes";
import {
  buildTransactionHref,
  buildTransactionSearchParams,
  hasActiveFilters,
  type TransactionFilters,
} from "@/lib/finance/filters";
import { dayLabel, groupTransactionsByDay } from "@/lib/finance/day-labels";
import { aplicarEventosAoResumo } from "@/lib/finance/budgets";
import { aplicarFaturasAoResumo } from "@/lib/finance/cards";
import { summarizeTransactions } from "@/lib/finance/summary";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type OptimisticAction =
  | { type: "paid"; ids: string[]; pago: boolean }
  | {
      type: "category";
      ids: string[];
      category: {
        id: string;
        nome: string;
        icone: string;
        cor: string;
        tipo: "despesa" | "receita";
      };
    }
  | { type: "tag"; ids: string[]; tag: { id: string; nome: string } }
  | { type: "delete"; ids: string[] };

function optimisticReducer(
  state: TransactionListItem[],
  action: OptimisticAction,
): TransactionListItem[] {
  switch (action.type) {
    case "paid":
      return state.map((transaction) =>
        action.ids.includes(transaction.id)
          ? { ...transaction, pago: action.pago }
          : transaction,
      );
    case "category":
      return state.map((transaction) =>
        action.ids.includes(transaction.id) &&
        transaction.tipo === action.category.tipo
          ? {
              ...transaction,
              categoriaId: action.category.id,
              categoriaNome: action.category.nome,
              categoriaIcone: action.category.icone,
              categoriaCor: action.category.cor,
            }
          : transaction,
      );
    case "tag":
      return state.map((transaction) =>
        action.ids.includes(transaction.id)
          ? {
              ...transaction,
              tags: transaction.tags.some((tag) => tag.id === action.tag.id)
                ? transaction.tags
                : [...transaction.tags, action.tag],
            }
          : transaction,
      );
    case "delete":
      return state.filter(
        (transaction) => !action.ids.includes(transaction.id),
      );
  }
}

type TransactionsPageClientProps = {
  filters: TransactionFilters;
  transactions: TransactionListItem[];
  budgetEvents: BudgetEventView[];
  cardInvoiceEvents: CardInvoiceEvent[];
  formData: TransactionFormData;
  detail: TransactionDetail | null;
  dayBalances: Record<string, number>;
  today: string;
  overdueIds: string[];
  initialNew: boolean;
};

type TransactionDayGroup = {
  day: string;
  items: TransactionListItem[];
  events: BudgetEventView[];
  invoices: CardInvoiceEvent[];
};

export function TransactionsPageClient({
  filters,
  transactions,
  budgetEvents,
  cardInvoiceEvents,
  formData,
  detail,
  dayBalances,
  today,
  overdueIds,
  initialNew,
}: TransactionsPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [optimisticTransactions, applyOptimistic] = useOptimistic(
    transactions,
    optimisticReducer,
  );
  const [isBulkPending, startBulkTransition] = useTransition();

  const [createOpen, setCreateOpen] = useState(initialNew);
  const [editing, setEditing] = useState<{
    transaction: TransactionListItem;
    scope: Scope;
  } | null>(null);
  const [scopeAction, setScopeAction] = useState<{
    mode: "edit" | "delete";
    transaction: TransactionListItem;
  } | null>(null);
  const [deleting, setDeleting] = useState<TransactionListItem | null>(null);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [selectedBudgetEvent, setSelectedBudgetEvent] =
    useState<BudgetEventView | null>(null);

  useEffect(() => {
    if (initialNew) setCreateOpen(true);
  }, [initialNew]);

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = new Set(transactions.map((transaction) => transaction.id));
      const next = new Set(
        [...current].filter((id) => valid.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [transactions]);

  useEffect(() => {
    if (!detail) return;
    const detailId = detail.id;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.isContentEditable)
      ) {
        return;
      }

      event.preventDefault();
      const ids = optimisticTransactions.map((transaction) => transaction.id);
      const index = ids.indexOf(detailId);
      if (index < 0) return;
      const nextId =
        event.key === "ArrowDown" ? ids[index + 1] : ids[index - 1];
      if (nextId) {
        router.push(buildTransactionHref({ ...filters, detalhe: nextId }));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detail, optimisticTransactions, filters, router]);

  const groups = useMemo<TransactionDayGroup[]>(() => {
    const base = groupTransactionsByDay(optimisticTransactions);
    const map = new Map<string, TransactionDayGroup>(
      base.map((group) => [
        group.day,
        { day: group.day, items: group.items, events: [], invoices: [] },
      ]),
    );

    for (const event of budgetEvents) {
      let group = map.get(event.data);
      if (!group) {
        group = { day: event.data, items: [], events: [], invoices: [] };
        map.set(event.data, group);
      }
      group.events.push(event);
    }

    for (const invoice of cardInvoiceEvents) {
      let group = map.get(invoice.vencimento);
      if (!group) {
        group = {
          day: invoice.vencimento,
          items: [],
          events: [],
          invoices: [],
        };
        map.set(invoice.vencimento, group);
      }
      group.invoices.push(invoice);
    }

    return [...map.values()].sort((a, b) => a.day.localeCompare(b.day));
  }, [optimisticTransactions, budgetEvents, cardInvoiceEvents]);
  const visibleGroups = groups.slice(0, filters.dias);
  const summary = useMemo(
    () =>
      aplicarFaturasAoResumo(
        aplicarEventosAoResumo(
          summarizeTransactions(optimisticTransactions),
          budgetEvents,
        ),
        cardInvoiceEvents,
      ),
    [optimisticTransactions, budgetEvents, cardInvoiceEvents],
  );
  const hasMoreDays = groups.length > filters.dias;
  const activeFilters = hasActiveFilters(filters);
  const selectedCount = selectedIds.size;

  function go(next: TransactionFilters) {
    router.push(buildTransactionHref(next));
  }

  function changeFilters(
    patch: Partial<
      Pick<
        TransactionFilters,
        | "tipo"
        | "contas"
        | "cartoes"
        | "categorias"
        | "tags"
        | "status"
        | "q"
        | "comprasCartao"
      >
    >,
  ) {
    go({ ...filters, ...patch, dias: 10, detalhe: null });
  }

  function clearFilters() {
    go({
      ...filters,
      tipo: null,
      contas: [],
      cartoes: [],
      categorias: [],
      tags: [],
      status: "todos",
      q: null,
      dias: 10,
      detalhe: null,
      comprasCartao: false,
    });
  }

  function changeMonth(monthKey: string) {
    go({ ...filters, mes: monthKey, dias: 10, detalhe: null });
  }

  function openDetails(transaction: TransactionListItem) {
    go({ ...filters, detalhe: transaction.id });
  }

  function closeDetails() {
    if (filters.detalhe) go({ ...filters, detalhe: null });
  }

  function navigateDetail(id: string) {
    go({ ...filters, detalhe: id });
  }

  function loadMoreDays() {
    go({ ...filters, dias: Math.min(31, filters.dias + 10) });
  }

  function closeCreate(open: boolean) {
    setCreateOpen(open);
    if (!open && initialNew) {
      router.replace(buildTransactionHref({ ...filters, detalhe: null }));
    }
  }

  function handleSaved() {
    router.refresh();
  }

  function handleEdit(transaction: TransactionListItem) {
    setFlash(null);
    if (transaction.recorrenciaId || transaction.parcelaGrupoId) {
      setScopeAction({ mode: "edit", transaction });
      return;
    }
    setEditing({ transaction, scope: "single" });
  }

  function handleDelete(transaction: TransactionListItem) {
    setFlash(null);
    if (transaction.recorrenciaId || transaction.parcelaGrupoId) {
      setScopeAction({ mode: "delete", transaction });
      return;
    }
    setDeleting(transaction);
  }

  async function handleDuplicate(transaction: TransactionListItem) {
    setFlash(null);
    const result = await duplicateTransactionAction(transaction.id);
    if (!result.ok) {
      setFlash(result.error);
      return;
    }
    if (result.budgetNotice) {
      toast({
        description: result.budgetNotice.message,
        tone: result.budgetNotice.tone,
      });
    }
    router.refresh();
  }

  async function handleScopeSelect(scope: Scope) {
    if (!scopeAction) return;
    const { mode, transaction } = scopeAction;
    setScopeAction(null);

    if (mode === "edit") {
      setEditing({ transaction, scope });
      return;
    }

    const result = await deleteTransactionAction({
      id: transaction.id,
      scope,
    });

    if (!result.ok) {
      setFlash(result.error);
      return;
    }
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setPendingDelete(true);
    setFlash(null);
    const result = await deleteTransactionAction({
      id: deleting.id,
      scope: "single",
    });
    setPendingDelete(false);

    if (!result.ok) {
      setFlash(result.error);
      return;
    }

    setDeleting(null);
    router.refresh();
  }

  function handleFormDelete(transaction: TransactionListItem) {
    setEditing(null);
    setCreateOpen(false);
    handleDelete(transaction);
  }

  function handleDetailEdit(transaction: TransactionDetail) {
    // Mantém o painel aberto: o modal de edição/escopo abre por cima e, ao
    // salvar, o painel é atualizado pelo refresh do servidor.
    handleEdit(transaction);
  }

  function handleDetailDelete(transaction: TransactionDetail) {
    // Após excluir, o detalhe deixa de existir e o painel fecha no refresh.
    handleDelete(transaction);
  }

  function handleDetailDuplicate(transaction: TransactionDetail) {
    closeDetails();
    void handleDuplicate(transaction);
  }

  async function handleDetailTogglePaid(id: string, pago: boolean) {
    const result = await setTransactionPaidAction({ id, pago });
    if (result.ok) router.refresh();
    return result;
  }

  function handleTogglePaid(transaction: TransactionListItem, pago: boolean) {
    startBulkTransition(async () => {
      applyOptimistic({ type: "paid", ids: [transaction.id], pago });
      const result = await setTransactionPaidAction({
        id: transaction.id,
        pago,
      });
      if (!result.ok) setFlash(result.error);
      router.refresh();
    });
  }

  function toggleSelectionMode() {
    if (selectionMode) {
      setSelectionMode(false);
      setSelectedIds(new Set());
    } else {
      setSelectionMode(true);
      setSelectedIds(new Set());
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDay(items: TransactionListItem[], checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of items) {
        if (checked) next.add(item.id);
        else next.delete(item.id);
      }
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(
      new Set(
        optimisticTransactions
          .filter((item) => !item.cartaoId)
          .map((item) => item.id),
      ),
    );
  }

  function exitSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  function handleLongPress(transaction: TransactionListItem) {
    setSelectionMode(true);
    setSelectedIds(new Set([transaction.id]));
  }

  function bulkSetPaid(pago: boolean) {
    const ids = [...selectedIds];
    if (ids.length === 0) return;

    startBulkTransition(async () => {
      applyOptimistic({ type: "paid", ids, pago });
      const result = await bulkSetPaidAction({ ids, pago });
      if (!result.ok) setFlash(result.error);
      setSelectedIds(new Set());
      router.refresh();
    });
  }

  function bulkChangeCategory(categoryId: string) {
    const category = formData.categories.find(
      (item) => item.id === categoryId,
    );
    if (!category) {
      setBulkError("Categoria não encontrada.");
      return;
    }

    const ids = [...selectedIds];
    setBulkError(null);

    startBulkTransition(async () => {
      applyOptimistic({
        type: "category",
        ids,
        category: {
          id: category.id,
          nome: category.nome,
          icone: category.icone,
          cor: category.cor,
          tipo: category.tipo,
        },
      });
      const result = await bulkChangeCategoryAction({
        ids,
        categoriaId: category.id,
      });

      if (!result.ok) {
        setBulkError(result.error);
        router.refresh();
        return;
      }

      setBulkCategoryOpen(false);
      setSelectedIds(new Set());
      setFlash(
        result.ignored
          ? `${result.count} lançamento(s) atualizado(s); ${result.ignored} ignorado(s) por tipo/transferência.`
          : `${result.count} lançamento(s) atualizado(s).`,
      );
      if (result.budgetNotice) {
        toast({
          description: result.budgetNotice.message,
          tone: result.budgetNotice.tone,
        });
      }
      router.refresh();
    });
  }

  function bulkAddTag(tagId: string) {
    const tag = formData.tags.find((item) => item.id === tagId);
    if (!tag) {
      setBulkError("Tag não encontrada.");
      return;
    }

    const ids = [...selectedIds];
    setBulkError(null);

    startBulkTransition(async () => {
      applyOptimistic({ type: "tag", ids, tag });
      const result = await bulkAddTagAction({ ids, tagId: tag.id });

      if (!result.ok) {
        setBulkError(result.error);
        router.refresh();
        return;
      }

      setBulkTagOpen(false);
      setSelectedIds(new Set());
      setFlash(`${result.count} lançamento(s) marcado(s) com #${tag.nome}.`);
      router.refresh();
    });
  }

  function bulkDelete() {
    const ids = [...selectedIds];
    setBulkError(null);

    startBulkTransition(async () => {
      applyOptimistic({ type: "delete", ids });
      const result = await bulkDeleteTransactionsAction({ ids });

      if (!result.ok) {
        setBulkError(result.error);
        router.refresh();
        return;
      }

      setBulkDeleteOpen(false);
      setSelectedIds(new Set());
      setFlash(`${result.count} lançamento(s) excluído(s).`);
      router.refresh();
    });
  }

  function markOverduePaid() {
    const ids = overdueIds;
    if (ids.length === 0) return;

    startBulkTransition(async () => {
      applyOptimistic({ type: "paid", ids, pago: true });
      const result = await bulkSetPaidAction({ ids, pago: true });
      if (!result.ok) setFlash(result.error);
      setOverdueOpen(false);
      router.refresh();
    });
  }

  const exportHref = `/api/export/transactions?${buildTransactionSearchParams(
    { ...filters, detalhe: null },
  ).toString()}`;

  return (
    <div className="space-y-4 pb-48 lg:pb-28">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          onClick={() => setCreateOpen(true)}
          aria-label="Novo lançamento"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Lançamento</span>
        </Button>

        <div className="order-3 flex w-full items-center justify-center gap-1 sm:order-2 sm:w-auto sm:flex-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Mês anterior"
            onClick={() => changeMonth(addMonths(filters.mes, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <MonthPicker
            month={filters.mes}
            onChange={changeMonth}
            className="text-center"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Próximo mês"
            onClick={() => changeMonth(addMonths(filters.mes, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="order-2 ml-auto flex items-center gap-1 sm:order-3">
          <Button
            type="button"
            variant={selectionMode ? "default" : "outline"}
            size="sm"
            className="h-11"
            onClick={toggleSelectionMode}
            aria-pressed={selectionMode}
            aria-label={
              selectionMode
                ? "Sair do modo de seleção"
                : "Selecionar lançamentos"
            }
          >
            {selectionMode ? (
              <X className="h-4 w-4" />
            ) : (
              <CheckSquare className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {selectionMode ? "Sair" : "Selecionar"}
            </span>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-11 w-11"
                aria-label="Mais ações"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <a href={exportHref} download>
                  <Download />
                  Exportar mês filtrado (CSV)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={overdueIds.length === 0}
                onSelect={() => setOverdueOpen(true)}
              >
                <CheckSquare />
                Marcar vencidos como pagos ({overdueIds.length})
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => changeMonth(currentMonth())}>
                Ir para hoje
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <FilterBar
        filters={filters}
        options={formData}
        onChange={changeFilters}
        onClear={clearFilters}
      />

      {selectionMode && (
        <BulkActionsBar
          selectedCount={selectedCount}
          onSelectAll={selectAll}
          onClearSelection={() => setSelectedIds(new Set())}
          onMarkPaid={() => bulkSetPaid(true)}
          onMarkUnpaid={() => bulkSetPaid(false)}
          onCategory={() => {
            setBulkError(null);
            setBulkCategoryOpen(true);
          }}
          onTag={() => {
            setBulkError(null);
            setBulkTagOpen(true);
          }}
          onDelete={() => {
            setBulkError(null);
            setBulkDeleteOpen(true);
          }}
          onExit={exitSelection}
        />
      )}

      <FormError message={flash} />

      {visibleGroups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <EmptyState
            icon={ReceiptText}
            title={
              activeFilters
                ? "Nenhum lançamento com esses filtros"
                : "Nenhum lançamento neste mês"
            }
            description={
              activeFilters
                ? "Tente remover filtros ou mudar o mês."
                : "Adicione uma despesa, receita ou transferência para começar."
            }
            action={
              activeFilters ? (
                <Button variant="outline" onClick={clearFilters}>
                  Limpar filtros
                </Button>
              ) : (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Adicionar lançamento
                </Button>
              )
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {visibleGroups.map((group) => {
            const selectableItems = group.items.filter(
              (item) => !item.cartaoId,
            );
            const allSelected =
              selectableItems.length > 0 &&
              selectableItems.every((item) => selectedIds.has(item.id));
            const someSelected = selectableItems.some((item) =>
              selectedIds.has(item.id),
            );
            const balance = dayBalances[group.day] ?? 0;

            return (
              <div
                key={group.day}
                className="overflow-hidden rounded-xl border border-border bg-card"
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 sm:px-4",
                    group.day === today && "bg-primary/10",
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {selectionMode && selectableItems.length > 0 && (
                      <Checkbox
                        checked={
                          allSelected
                            ? true
                            : someSelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={(checked) =>
                          toggleDay(selectableItems, checked === true)
                        }
                        aria-label={`Selecionar todos os lançamentos de ${formatDate(group.day)}`}
                      />
                    )}
                    <p className="truncate text-sm font-semibold">
                      {dayLabel(group.day, today)}
                    </p>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatDate(group.day)}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {group.items.length} lançamento(s)
                    {group.events.length > 0
                      ? ` · ${group.events.length} orçamento(s)`
                      : ""}
                    {group.invoices.length > 0
                      ? ` · ${group.invoices.length} fatura(s)`
                      : ""}
                  </span>
                </div>

                <div className="divide-y divide-border">
                  {group.items.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(transaction.id)}
                      onToggleSelected={toggleSelected}
                      onOpenDetails={openDetails}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={(item) => void handleDuplicate(item)}
                      onLongPress={handleLongPress}
                      onTogglePaid={handleTogglePaid}
                    />
                  ))}

                  {group.events.map((event) => (
                    <BudgetEventRow
                      key={event.id}
                      event={event}
                      onOpen={setSelectedBudgetEvent}
                    />
                  ))}

                  {group.invoices.map((invoice) => (
                    <CardInvoiceRow
                      key={invoice.id}
                      event={invoice}
                      onOpen={(event) => {
                        router.push(
                          `/cartoes/${event.cartaoId}?fatura=${event.faturaChave}`,
                        );
                      }}
                    />
                  ))}
                </div>

                <div
                  className="flex items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2 sm:px-4"
                  title="Saldo previsto acumulado das contas até este dia, incluindo provisões e sobras de orçamento."
                >
                  <span className="text-xs text-muted-foreground">
                    Saldo previsto no dia
                  </span>
                  <span
                    className={cn(
                      "tabular text-xs font-semibold",
                      balance < 0 ? "text-destructive" : "text-foreground",
                    )}
                  >
                    {formatCurrency(balance)}
                  </span>
                </div>
              </div>
            );
          })}

          {hasMoreDays && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" onClick={loadMoreDays}>
                Carregar mais dias ({groups.length - filters.dias} restantes)
              </Button>
            </div>
          )}
        </div>
      )}

      <TransactionsSummaryFooter summary={summary} />

      <TransactionFormDialog
        open={createOpen}
        onOpenChange={closeCreate}
        mode="create"
        formData={formData}
        onSaved={handleSaved}
      />

      {editing && (
        <TransactionFormDialog
          key={`${editing.transaction.id}-${editing.scope}`}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          mode="edit"
          transaction={editing.transaction}
          scope={editing.scope}
          formData={formData}
          onSaved={handleSaved}
          onRequestDelete={handleFormDelete}
        />
      )}

      <TransactionDetailsPanel
        detail={detail}
        onClose={closeDetails}
        onEdit={handleDetailEdit}
        onDelete={handleDetailDelete}
        onDuplicate={handleDetailDuplicate}
        onNavigate={navigateDetail}
        onTogglePaid={handleDetailTogglePaid}
      />

      <BudgetDetailDialog
        detail={
          selectedBudgetEvent
            ? {
                resumo: selectedBudgetEvent.resumo,
                transactions: selectedBudgetEvent.transactions,
              }
            : null
        }
        open={Boolean(selectedBudgetEvent)}
        onOpenChange={(open) => {
          if (!open) setSelectedBudgetEvent(null);
        }}
        onEdit={() => {
          if (!selectedBudgetEvent) return;
          const { ciclo, id } = selectedBudgetEvent.resumo;
          setSelectedBudgetEvent(null);
          router.push(
            `/limite-de-gastos?ciclo=${ciclo}&orcamento=${id}`,
          );
        }}
      />

      <ScopeDialog
        open={Boolean(scopeAction)}
        onOpenChange={(open) => {
          if (!open) setScopeAction(null);
        }}
        mode={scopeAction?.mode ?? "edit"}
        transaction={scopeAction?.transaction ?? null}
        onSelect={(scope) => void handleScopeSelect(scope)}
      />

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir lançamento</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir{" "}
              <strong className="text-foreground">{deleting?.descricao}</strong>{" "}
              de {deleting ? formatDate(deleting.data) : ""}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={pendingDelete}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={pendingDelete}
            >
              {pendingDelete && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir lançamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={overdueOpen} onOpenChange={setOverdueOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Marcar vencidos como pagos</DialogTitle>
            <DialogDescription>
              {overdueIds.length} lançamento(s) não pago(s) com data anterior a{" "}
              {formatDate(today)} serão marcados como pagos.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOverdueOpen(false)}
              disabled={isBulkPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={markOverduePaid}
              disabled={isBulkPending || overdueIds.length === 0}
            >
              {isBulkPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Marcar {overdueIds.length} como pagos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkCategoryDialog
        open={bulkCategoryOpen}
        onOpenChange={(open) => {
          setBulkCategoryOpen(open);
          if (!open) setBulkError(null);
        }}
        categories={formData.categories}
        onConfirm={bulkChangeCategory}
        pending={isBulkPending}
        error={bulkError}
      />

      <BulkTagDialog
        open={bulkTagOpen}
        onOpenChange={(open) => {
          setBulkTagOpen(open);
          if (!open) setBulkError(null);
        }}
        tags={formData.tags}
        onConfirm={bulkAddTag}
        pending={isBulkPending}
        error={bulkError}
      />

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={(open) => {
          setBulkDeleteOpen(open);
          if (!open) setBulkError(null);
        }}
        count={selectedCount}
        onConfirm={bulkDelete}
        pending={isBulkPending}
        error={bulkError}
      />
    </div>
  );
}
