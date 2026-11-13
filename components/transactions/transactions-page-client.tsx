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
  ListFilter,
  MoreVertical,
  Plus,
  ReceiptText,
  Search,
  SlidersHorizontal,
  Wallet,
  X,
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
  BulkBudgetOffsetDialog,
  BulkCategoryDialog,
  BulkDeleteDialog,
  BulkTagDialog,
  QuickCategoryDialog,
} from "./bulk-actions";
import { FilterBar } from "./filter-bar";
import { ScopeDialog } from "./scope-dialog";
import { TransactionDetailsPanel } from "./transaction-details-panel";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransactionRow } from "./transaction-row";
import { BudgetEventRow } from "./budget-event-row";
import { CardInvoiceRow } from "./card-invoice-row";
import { CardDetailView } from "@/components/cards/card-detail-view";
import { getCardInvoiceDetailAction } from "@/lib/actions/cards";
import { BudgetDetailDialog } from "@/components/budgets/budget-detail-dialog";
import { TransactionsSummaryFooter } from "./transactions-summary-footer";
import { useToast } from "@/components/ui/toast";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { useSecondaryInfo } from "@/lib/hooks/use-secondary-info";
import {
  bulkAddTagAction,
  bulkChangeCategoryAction,
  bulkDeleteTransactionsAction,
  bulkSetBudgetOffsetAction,
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
import type { CardInvoiceEvent, CardInvoiceDetail } from "@/lib/db/queries/cards";
import { ForecastBanner } from "@/components/forecast/forecast-banner";
import type { ForecastAlert } from "@/lib/db/queries/forecast";
import {
  addMonths,
  currentMonth,
  todayISO,
} from "@/lib/dates";
import type { Scope } from "@/lib/finance/scopes";
import { countLabel } from "@/lib/design/plural";
import {
  buildTransactionHref,
  buildTransactionSearchParams,
  countActiveFilters,
  hasActiveFilters,
  type TransactionFilters,
} from "@/lib/finance/filters";
import { groupTransactionsByDay } from "@/lib/finance/day-labels";
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
  openingBalance: number;
  today: string;
  overdueIds: string[];
  initialNew: boolean;
  userId: string;
  forecastAlert: ForecastAlert | null;
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
  openingBalance,
  today,
  overdueIds,
  initialNew,
  userId,
  forecastAlert,
}: TransactionsPageClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [secondaryInfo] = useSecondaryInfo();
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
  const [bulkBudgetOpen, setBulkBudgetOpen] = useState(false);
  const [bulkTagOpen, setBulkTagOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [categoryTarget, setCategoryTarget] =
    useState<TransactionListItem | null>(null);
  const [overdueOpen, setOverdueOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filtersSearchFocus, setFiltersSearchFocus] = useState(false);

  useEffect(() => {
    function openNew() {
      setCreateOpen(true);
    }
    window.addEventListener("verde:new-transaction", openNew);
    return () =>
      window.removeEventListener("verde:new-transaction", openNew);
  }, []);

  const [selectedBudgetEvent, setSelectedBudgetEvent] =
    useState<BudgetEventView | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<{
    cartaoId: string;
    faturaChave: string;
    pay: boolean;
  } | null>(null);
  const [invoiceDetail, setInvoiceDetail] =
    useState<CardInvoiceDetail | null>(null);
  const [invoiceAccounts, setInvoiceAccounts] = useState<
    { id: string; nome: string; arquivada: boolean }[]
  >([]);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  function loadInvoice(target: {
    cartaoId: string;
    faturaChave: string;
    pay: boolean;
  }) {
    setInvoiceTarget(target);
    setInvoiceDetail(null);
    setInvoiceError(null);
    setInvoiceLoading(true);
    void getCardInvoiceDetailAction(target.cartaoId, target.faturaChave)
      .then((result) => {
        if (result.ok) {
          setInvoiceDetail(result.detail);
          setInvoiceAccounts(result.accounts);
        } else {
          setInvoiceError(result.error);
        }
      })
      .catch(() => setInvoiceError("Não foi possível carregar a fatura."))
      .finally(() => setInvoiceLoading(false));
  }

  function reloadInvoice() {
    if (!invoiceTarget) return;
    loadInvoice({ ...invoiceTarget, pay: false });
  }

  useEffect(() => {
    if (initialNew) setCreateOpen(true);
  }, [initialNew]);

  useEffect(() => {
    setSelectedIds((current) => {
      const valid = new Set(
        transactions
          .filter(
            (transaction) =>
              filters.tipo === "transferencia" || !transaction.vinculadaFatura,
          )
          .map((transaction) => transaction.id),
      );
      const next = new Set(
        [...current].filter((id) => valid.has(id)),
      );
      return next.size === current.size ? current : next;
    });
  }, [transactions, filters.tipo]);

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
    const visibleTransactions = optimisticTransactions.filter(
      (transaction) =>
        filters.tipo === "transferencia" || !transaction.vinculadaFatura,
    );
    const base = groupTransactionsByDay(visibleTransactions);
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
  }, [optimisticTransactions, budgetEvents, cardInvoiceEvents, filters.tipo]);
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
      de: null,
      ate: null,
    });
  }

  function changeMonth(monthKey: string) {
    go({
      ...filters,
      mes: monthKey,
      dias: 10,
      detalhe: null,
      de: null,
      ate: null,
    });
  }

  function goToToday() {
    const month = currentMonth();
    if (filters.mes !== month) {
      changeMonth(month);
      return;
    }
    document
      .getElementById(`day-${today}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
    go({ ...filters, dias: Math.min(370, filters.dias + 10) });
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

  function bulkChangeBudgetOffset(deslocamento: number) {
    const ids = [...selectedIds];
    setBulkError(null);

    startBulkTransition(async () => {
      const result = await bulkSetBudgetOffsetAction({ ids, deslocamento });
      if (!result.ok) {
        setBulkError(result.error);
        router.refresh();
        return;
      }

      setBulkBudgetOpen(false);
      setSelectedIds(new Set());
      setFlash(`${result.count} lançamento(s) atualizado(s).`);
      if (result.budgetNotice) {
        toast({
          description: result.budgetNotice.message,
          tone: result.budgetNotice.tone,
        });
      }
      router.refresh();
    });
  }

  function changeCategoryOf(target: TransactionListItem, categoryId: string) {
    const category = formData.categories.find(
      (item) => item.id === categoryId,
    );
    if (!category) {
      setFlash("Categoria não encontrada.");
      return;
    }

    setCategoryTarget(null);
    startBulkTransition(async () => {
      applyOptimistic({
        type: "category",
        ids: [target.id],
        category: {
          id: category.id,
          nome: category.nome,
          icone: category.icone,
          cor: category.cor,
          tipo: category.tipo,
        },
      });
      const result = await bulkChangeCategoryAction({
        ids: [target.id],
        categoriaId: category.id,
      });

      if (!result.ok) {
        setFlash(result.error);
      } else if (result.budgetNotice) {
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
    <div className="space-y-4 pb-[3.25rem] lg:pb-0">
      {forecastAlert && (
        <ForecastBanner
          userId={userId}
          month={filters.mes}
          alert={forecastAlert}
        />
      )}
      <div className="flex items-center gap-1 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:gap-3">
        <div className="hidden min-w-0 lg:block">
          <h2 className="text-2xl font-semibold tracking-tight">Lançamentos</h2>
          <p className="text-sm text-muted-foreground">
            Acompanhe o que entrou e saiu no mês.
          </p>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center gap-0.5 rounded-lg border border-grout bg-forest-container/90 p-0.5 shadow-[inset_0_1px_3px_rgba(0,0,0,0.35)] lg:flex-none lg:gap-1 lg:p-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-lg"
            aria-label="Mês anterior"
            onClick={() => changeMonth(addMonths(filters.mes, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <MonthPicker
            month={filters.mes}
            onChange={changeMonth}
            className="text-center text-[13px] lg:text-base"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0 rounded-lg"
            aria-label="Próximo mês"
            onClick={() => changeMonth(addMonths(filters.mes, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-1 lg:justify-end">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 lg:hidden"
            aria-label="Buscar lançamentos"
            onClick={() => {
              setFiltersSearchFocus(true);
              setFiltersOpen(true);
            }}
          >
            <Search className="h-5 w-5" />
          </Button>

          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative h-11 w-11 lg:hidden"
            aria-label={
              countActiveFilters(filters) > 0
                ? `Filtros (${countActiveFilters(filters)} ativos)`
                : "Filtros"
            }
            onClick={() => {
              setFiltersSearchFocus(false);
              setFiltersOpen(true);
            }}
          >
            <ListFilter className="h-5 w-5" />
            {countActiveFilters(filters) > 0 && (
              <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground">
                {countActiveFilters(filters)}
              </span>
            )}
          </Button>

          <Button
            type="button"
            variant={selectionMode ? "default" : "outline"}
            size="icon"
            className="hidden h-11 w-11 lg:inline-flex"
            onClick={toggleSelectionMode}
            aria-pressed={selectionMode}
            aria-label={
              selectionMode
                ? "Sair do modo de seleção"
                : "Selecionar lançamentos"
            }
            title={
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
          </Button>

          <Button
            type="button"
            className="hidden h-11 lg:inline-flex"
            onClick={() => setCreateOpen(true)}
            aria-label="Novo lançamento"
          >
            <Plus className="h-4 w-4" />
            Lançamento
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
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="lg:hidden"
                onSelect={() => toggleSelectionMode()}
              >
                <CheckSquare />
                {selectionMode ? "Sair da seleção" : "Selecionar lançamentos"}
              </DropdownMenuItem>
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
              <DropdownMenuItem onSelect={() => goToToday()}>
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
        sheetOpen={filtersOpen}
        onSheetOpenChange={setFiltersOpen}
        searchFocus={filtersSearchFocus}
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
          onBudgetOffset={() => {
            setBulkError(null);
            setBulkBudgetOpen(true);
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
            const summaryParts = [
              group.items.length === 0
                ? "Nenhum lançamento"
                : countLabel(group.items.length, "lançamento", "lançamentos"),
            ];
            if (group.events.length > 0) {
              summaryParts.push(
                countLabel(group.events.length, "orçamento", "orçamentos"),
              );
            }
            if (group.invoices.length > 0) {
              summaryParts.push(
                countLabel(group.invoices.length, "fatura", "faturas"),
              );
            }

            return (
              <div
                key={group.day}
                id={`day-${group.day}`}
                className={cn(
                  isMobile
                    ? "border-b border-border"
                    : "scroll-mt-4 overflow-hidden rounded-lg border border-grout bg-surface-low",
                )}
              >
                <div
                  className={cn(
                    "flex items-center justify-between gap-2 border-b",
                    isMobile
                      ? "sticky top-0 z-20 h-10 flex-nowrap border-border bg-background"
                      : "flex-wrap border-grout bg-forest-container/70 px-3 py-2.5 sm:px-4",
                    !isMobile && group.day === today && "bg-amber/10",
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
                    <span
                      className={cn(
                        "font-display tabular font-bold leading-none",
                        isMobile ? "text-xl" : "text-2xl",
                      )}
                    >
                      {Number(group.day.slice(8, 10))}
                    </span>
                    <span
                      className={cn(
                        isMobile
                          ? "text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                          : "rounded border border-grout bg-forest-high px-1.5 py-0.5 font-mono text-xs font-semibold uppercase tracking-[0.08em] text-primary",
                      )}
                    >
                      {new Intl.DateTimeFormat("pt-BR", {
                        weekday: "short",
                        timeZone: "UTC",
                      })
                        .format(new Date(`${group.day}T12:00:00Z`))
                        .replace(".", "")}
                    </span>
                    {group.day === today && (
                      <Badge
                        className={cn(
                          "bg-amber/15 text-amber",
                          isMobile && "h-5 px-2 py-0",
                        )}
                      >
                        Hoje
                      </Badge>
                    )}
                    <span className="hidden text-xs text-outline sm:inline">
                      {formatDate(group.day)}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
                    <span className="hidden shrink-0 sm:inline">
                      {summaryParts.join(" · ")}
                    </span>
                    {!filters.de && !filters.ate && (
                      <span
                        className={cn(
                          "tabular inline-flex items-center gap-1 font-semibold",
                          isMobile ? "text-sm" : "text-xs",
                          balance < 0 ? "text-clay" : "text-on-surface",
                        )}
                        title="Saldo previsto acumulado das contas até este dia"
                      >
                        <Wallet
                          className="hidden h-3.5 w-3.5 text-amber sm:inline"
                          aria-hidden="true"
                        />
                        <span
                          className={cn(
                            "text-xs font-normal",
                            isMobile
                              ? "text-muted-foreground"
                              : "hidden text-outline sm:inline",
                          )}
                        >
                          Saldo do dia
                        </span>
                        {formatCurrency(balance)}
                      </span>
                    )}
                  </div>
                </div>

                <div className={isMobile ? "divide-y divide-border" : "space-y-2 p-2"}>
                  {group.items.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      secondaryInfo={secondaryInfo}
                      selectionMode={selectionMode}
                      selected={selectedIds.has(transaction.id)}
                      onToggleSelected={toggleSelected}
                      onOpenDetails={openDetails}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={(item) => void handleDuplicate(item)}
                      onLongPress={handleLongPress}
                      onTogglePaid={handleTogglePaid}
                      onChangeCategory={(item) => {
                        setCategoryTarget(item);
                        setFlash(null);
                      }}
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
                        loadInvoice({
                          cartaoId: event.cartaoId,
                          faturaChave: event.faturaChave,
                          pay: false,
                        });
                      }}
                      onPay={(event) => {
                        loadInvoice({
                          cartaoId: event.cartaoId,
                          faturaChave: event.faturaChave,
                          pay: true,
                        });
                      }}
                    />
                  ))}
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

      <TransactionsSummaryFooter
        summary={summary}
        openingBalance={openingBalance}
      />

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

      <Dialog
        open={Boolean(invoiceTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setInvoiceTarget(null);
            setInvoiceDetail(null);
            setInvoiceError(null);
          }
        }}
      >
        <DialogContent className="max-h-[92dvh] overflow-y-auto p-0 sm:max-w-2xl">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="sr-only">Fatura do cartão</DialogTitle>
          </DialogHeader>
          {invoiceLoading && (
            <div className="flex items-center gap-2 px-4 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Carregando fatura…
            </div>
          )}
          {invoiceError && (
            <div className="px-4 py-4">
              <FormError message={invoiceError} />
            </div>
          )}
          {invoiceDetail && (
            <div className="p-4">
              <CardDetailView
                embedded
                detail={invoiceDetail}
                formData={null}
                accounts={invoiceAccounts}
                initialPay={invoiceTarget?.pay ?? false}
                onChanged={reloadInvoice}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

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

      <BulkBudgetOffsetDialog
        open={bulkBudgetOpen}
        onOpenChange={(open) => {
          setBulkBudgetOpen(open);
          if (!open) setBulkError(null);
        }}
        onConfirm={bulkChangeBudgetOffset}
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

      <QuickCategoryDialog
        open={Boolean(categoryTarget)}
        onOpenChange={(open) => {
          if (!open) setCategoryTarget(null);
        }}
        categories={formData.categories}
        tipo={categoryTarget?.tipo === "receita" ? "receita" : "despesa"}
        currentCategoryId={categoryTarget?.categoriaId ?? null}
        onConfirm={(categoryId) => {
          if (categoryTarget) changeCategoryOf(categoryTarget, categoryId);
        }}
      />
    </div>
  );
}
