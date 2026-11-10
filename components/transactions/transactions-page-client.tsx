"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  ReceiptText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { FormError } from "@/components/form-feedback";
import { PageHeader } from "@/components/page-header";
import { ScopeDialog } from "./scope-dialog";
import { TransactionFormDialog } from "./transaction-form-dialog";
import { TransactionRow } from "./transaction-row";
import {
  deleteTransactionAction,
  duplicateTransactionAction,
} from "@/lib/actions/transactions";
import type {
  TransactionFormData,
  TransactionListItem,
} from "@/lib/db/queries/transactions";
import {
  addMonths,
  currentMonth,
  todayISO,
  weekdayShort,
} from "@/lib/dates";
import type { MonthSummary } from "@/lib/finance/summary";
import type { Scope } from "@/lib/finance/scopes";
import { formatCurrency, formatDate, formatMonthTitle } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionsPageClientProps = {
  month: string;
  transactions: TransactionListItem[];
  formData: TransactionFormData;
  summary: MonthSummary;
  initialNew: boolean;
};

function SummaryCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-0.5 p-3 sm:p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("tabular text-lg font-semibold", tone)}>{value}</p>
        <p className="text-[11px] text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

export function TransactionsPageClient({
  month,
  transactions,
  formData,
  summary,
  initialNew,
}: TransactionsPageClientProps) {
  const router = useRouter();
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

  useEffect(() => {
    if (initialNew) setCreateOpen(true);
  }, [initialNew]);

  const groups = useMemo(() => {
    const map = new Map<string, TransactionListItem[]>();
    for (const transaction of transactions) {
      const list = map.get(transaction.data) ?? [];
      list.push(transaction);
      map.set(transaction.data, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [transactions]);

  const isCurrentMonth = month === currentMonth();
  const today = todayISO();

  function clearNewParam() {
    if (initialNew) {
      router.replace(`/lancamentos?mes=${month}`);
    }
  }

  function closeCreate(open: boolean) {
    setCreateOpen(open);
    if (!open) clearNewParam();
  }

  function handleSaved() {
    setCreateOpen(false);
    setEditing(null);
    clearNewParam();
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

  function dayNet(items: TransactionListItem[]) {
    return items.reduce((sum, transaction) => {
      if (transaction.tipo === "receita") return sum + transaction.valor;
      if (transaction.tipo === "despesa") return sum - transaction.valor;
      return sum;
    }, 0);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Lançamentos"
        description="Seu fluxo de caixa, mês a mês."
        action={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Novo lançamento
          </Button>
        }
      />

      <Card>
        <CardContent className="flex items-center justify-between gap-2 p-3">
          <Button asChild variant="outline" size="icon" aria-label="Mês anterior">
            <Link href={`/lancamentos?mes=${addMonths(month, -1)}`}>
              <ChevronLeft className="h-4 w-4" />
            </Link>
          </Button>

          <div className="min-w-0 text-center">
            <p className="truncate text-base font-semibold sm:text-lg">
              {formatMonthTitle(month)}
            </p>
            <p className="text-xs text-muted-foreground">
              {transactions.length} lançamento(s)
              {!isCurrentMonth && (
                <>
                  {" · "}
                  <Link
                    href="/lancamentos"
                    className="text-primary hover:underline"
                  >
                    voltar para hoje
                  </Link>
                </>
              )}
            </p>
          </div>

          <Button asChild variant="outline" size="icon" aria-label="Próximo mês">
            <Link href={`/lancamentos?mes=${addMonths(month, 1)}`}>
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard
          label="Entradas"
          value={formatCurrency(summary.entradasPagas)}
          hint="receitas pagas"
          tone="text-success"
        />
        <SummaryCard
          label="Saídas"
          value={formatCurrency(summary.saidasPagas)}
          hint="despesas pagas"
          tone="text-destructive"
        />
        <SummaryCard
          label="Saldo realizado"
          value={formatCurrency(summary.saldoRealizado)}
          hint="entradas − saídas pagas"
          tone={
            summary.saldoRealizado >= 0 ? "text-success" : "text-destructive"
          }
        />
        <SummaryCard
          label="Saldo previsto"
          value={formatCurrency(summary.saldoPrevisto)}
          hint="inclui não pagos"
          tone={
            summary.saldoPrevisto >= 0 ? "text-foreground" : "text-destructive"
          }
        />
      </div>

      <FormError message={flash} />

      {groups.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={ReceiptText}
              title={`Nenhum lançamento em ${formatMonthTitle(month)}`}
              description="Adicione uma despesa, receita ou transferência para começar a acompanhar o mês."
              action={
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="h-4 w-4" />
                  Adicionar lançamento
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([day, items]) => {
            const net = dayNet(items);

            return (
              <Card key={day} className="overflow-hidden">
                <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2 sm:px-4">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="text-sm font-semibold">{formatDate(day)}</p>
                    <p className="text-xs capitalize text-muted-foreground">
                      {weekdayShort(day)}
                    </p>
                    {day === today && (
                      <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                        Hoje
                      </Badge>
                    )}
                  </div>
                  {net !== 0 && (
                    <p
                      className={cn(
                        "tabular text-xs font-medium",
                        net > 0 ? "text-success" : "text-destructive",
                      )}
                    >
                      {net > 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(net))}
                    </p>
                  )}
                </div>

                <div className="divide-y divide-border">
                  {items.map((transaction) => (
                    <TransactionRow
                      key={transaction.id}
                      transaction={transaction}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onDuplicate={(item) => void handleDuplicate(item)}
                      onError={setFlash}
                    />
                  ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}

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
        />
      )}

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
    </div>
  );
}
