"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  Landmark,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Trash2,
  TrendingUp,
  Wallet,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/empty-state";
import { FormError } from "@/components/form-feedback";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { AccountFormDialog } from "./account-form-dialog";
import {
  deleteAccountAction,
  setAccountArchivedAction,
} from "@/lib/actions/accounts";
import type { AccountWithBalance } from "@/lib/db/queries/accounts";
import type { AccountType } from "@/lib/db/schema";
import { formatCurrency } from "@/lib/format";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<AccountType, string> = {
  corrente: "Conta corrente",
  poupanca: "Poupança",
  dinheiro: "Dinheiro",
  investimento: "Investimento",
};

export function AccountsView({ accounts }: { accounts: AccountWithBalance[] }) {
  const router = useRouter();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AccountWithBalance | null>(null);
  const [deleting, setDeleting] = useState<AccountWithBalance | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const totals = useMemo(
    () =>
      accounts.reduce(
        (acc, account) => ({
          atual: acc.atual + account.saldoAtual,
          previsto: acc.previsto + account.saldoPrevisto,
        }),
        { atual: 0, previsto: 0 },
      ),
    [accounts],
  );

  const activeCount = accounts.filter((account) => !account.arquivada).length;

  function openNew() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(account: AccountWithBalance) {
    setEditing(account);
    setFormOpen(true);
  }

  async function toggleArchive(account: AccountWithBalance) {
    setPendingId(account.id);
    setFlash(null);
    const result = await setAccountArchivedAction(
      account.id,
      !account.arquivada,
    );
    setPendingId(null);

    if (!result.ok) {
      setFlash(result.error);
      return;
    }
    router.refresh();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setPendingId(deleting.id);
    setDeleteError(null);
    const result = await deleteAccountAction(deleting.id);
    setPendingId(null);

    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }

    setDeleting(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contas"
        description="Onde o seu dinheiro está agora e quanto deve entrar ou sair."
        action={
          <Button onClick={openNew}>
            <Plus className="h-4 w-4" />
            Nova conta
          </Button>
        }
      />

      <FormError message={flash} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          title="Saldo atual total"
          value={formatCurrency(totals.atual)}
          hint="Somente lançamentos pagos"
          icon={Wallet}
          tone="info"
        />
        <StatCard
          title="Saldo previsto total"
          value={formatCurrency(totals.previsto)}
          hint="Inclui lançamentos não pagos"
          icon={TrendingUp}
          tone="neutral"
        />
        <StatCard
          title="Contas ativas"
          value={String(activeCount)}
          hint={`${accounts.length} conta(s) no total`}
          icon={Landmark}
          tone="neutral"
        />
      </div>

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="p-6">
            <EmptyState
              icon={Wallet}
              title="Nenhuma conta cadastrada"
              description="Cadastre sua conta corrente, poupança, dinheiro ou investimento para começar."
              action={
                <Button onClick={openNew}>
                  <Plus className="h-4 w-4" />
                  Criar primeira conta
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((account) => {
            const Icon = getIcon(account.icone);
            const isPending = pendingId === account.id;

            return (
              <Card
                key={account.id}
                className={cn(
                  "transition-opacity",
                  account.arquivada && "opacity-65",
                )}
              >
                <CardContent className="space-y-4 p-5">
                  <div className="flex items-start gap-3">
                    <span
                      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
                      style={{
                        backgroundColor: `${account.cor}1f`,
                        color: account.cor,
                      }}
                    >
                      <Icon className="h-5 w-5" aria-hidden="true" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium">{account.nome}</p>
                        {account.arquivada && (
                          <Badge variant="secondary">Arquivada</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {TYPE_LABELS[account.tipo]}
                      </p>
                    </div>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-10 w-10 shrink-0"
                          aria-label={`Ações da conta ${account.nome}`}
                          disabled={isPending}
                        >
                          {isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <MoreHorizontal className="h-4 w-4" />
                          )}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => openEdit(account)}>
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => void toggleArchive(account)}
                        >
                          {account.arquivada ? (
                            <>
                              <ArchiveRestore />
                              Desarquivar
                            </>
                          ) : (
                            <>
                              <Archive />
                              Arquivar
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() => {
                            setDeleteError(null);
                            setDeleting(account);
                          }}
                        >
                          <Trash2 />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-4">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Saldo atual
                      </p>
                      <p
                        className={cn(
                          "tabular text-lg font-semibold",
                          account.saldoAtual < 0
                            ? "text-destructive"
                            : "text-foreground",
                        )}
                      >
                        {formatCurrency(account.saldoAtual)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Saldo previsto
                      </p>
                      <p
                        className={cn(
                          "tabular text-lg font-semibold",
                          account.saldoPrevisto < 0
                            ? "text-destructive"
                            : "text-muted-foreground",
                        )}
                      >
                        {formatCurrency(account.saldoPrevisto)}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        account={editing}
        onSaved={() => router.refresh()}
      />

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) {
            setDeleting(null);
            setDeleteError(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir conta</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja excluir{" "}
              <strong className="text-foreground">{deleting?.nome}</strong>?
              Contas com lançamentos não podem ser excluídas — nesse caso,
              arquive-a.
            </DialogDescription>
          </DialogHeader>

          <FormError message={deleteError} />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={Boolean(pendingId)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={Boolean(pendingId)}
            >
              {pendingId && <Loader2 className="h-4 w-4 animate-spin" />}
              Excluir conta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
