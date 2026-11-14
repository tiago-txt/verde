"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CreditCard,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useToast } from "@/components/ui/toast";
import { BudgetProgress, budgetTone } from "@/components/budgets/budget-progress";
import { CardFormDialog } from "./card-form-dialog";
import {
  createCardAction,
  deleteCardAction,
  setCardArchivedAction,
  updateCardAction,
} from "@/lib/actions/cards";
import type { CardWithInvoice } from "@/lib/db/queries/cards";
import type { CreditCard as CreditCardRow } from "@/lib/db/schema";
import { formatCurrency, formatDate, formatMonthTitle } from "@/lib/format";
import { EntityTile } from "@/components/entity-tile";
import { cn } from "@/lib/utils";
import type { CardFormValues } from "@/lib/validation/cards";

type CardAccountOption = {
  id: string;
  nome: string;
  arquivada: boolean;
};

type CardsViewProps = {
  cards: CardWithInvoice[];
  accounts: CardAccountOption[];
};

const BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  elo: "Elo",
  amex: "Amex",
  hipercard: "Hipercard",
  outra: "Outra",
};

const STATUS_LABELS = {
  aberta: "aberta",
  fechada: "fechada",
  parcial: "parcial",
  paga: "paga",
} as const;

export function CardsView({ cards, accounts }: CardsViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [, startTransition] = useTransition();
  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CreditCardRow | null>(null);
  const [deleting, setDeleting] = useState<CardWithInvoice | null>(null);

  const visible = showArchived ? cards : cards.filter((card) => !card.arquivado);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast({ description: result.error ?? "Não foi possível concluir.", tone: "error" });
        return;
      }
      toast({ description: success, tone: "success" });
      router.refresh();
    });
  }

  async function submitCard(values: CardFormValues) {
    const result = editing
      ? await updateCardAction({ ...values, id: editing.id })
      : await createCardAction(values);
    if (result.ok) {
      toast({
        description: editing ? "Cartão atualizado." : "Cartão criado.",
        tone: "success",
      });
      router.refresh();
    }
    return { ok: result.ok, error: result.ok ? undefined : result.error };
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="min-w-0 sm:flex-1">
          <h1 className="text-lg font-semibold">Cartões</h1>
          <p className="text-xs text-muted-foreground">
            Faturas calculadas pelo ciclo de compras. Compras não alteram o saldo
            da conta; o pagamento da fatura sim.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setShowArchived((current) => !current)}
            aria-pressed={showArchived}
          >
            <Archive className="h-4 w-4" />
            {showArchived ? "Ocultar arquivados" : "Mostrar arquivados"}
          </Button>

          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Novo cartão</span>
            <span className="sm:hidden">Novo</span>
          </Button>
        </div>
      </div>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6">
          <EmptyState
            icon={CreditCard}
            title="Adicione seu primeiro cartão"
            description="Cadastre fechamento, vencimento e limite para acompanhar as faturas."
            action={
              <Button
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                Novo cartão
              </Button>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhum cartão ativo. Use “Mostrar arquivados” para ver o histórico.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((card) => {
            const tone = budgetTone(card.limiteUsado, card.limite);
            const ratio =
              card.limite > 0 ? card.limiteUsado / card.limite : 0;
            const invoice = card.currentInvoice;

            return (
              <div
                key={card.id}
                className={cn(
                  "flex flex-col gap-3 rounded-xl border border-border bg-card p-4",
                  card.arquivado && "opacity-70",
                )}
              >
                <div className="flex items-start gap-3">
                  <EntityTile
                    kind="cartao"
                    entity={{
                      id: card.id,
                      nome: card.nome,
                      cor: card.cor,
                      icone: card.icone,
                    }}
                    size="sm"
                  />

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">
                        {card.nome}
                      </span>
                      <Badge variant="outline">
                        {BRAND_LABELS[card.bandeira] ?? card.bandeira}
                      </Badge>
                      {card.arquivado && (
                        <Badge variant="secondary">Arquivado</Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Fecha dia {card.diaFechamento} · vence dia{" "}
                      {card.diaVencimento}
                    </p>
                  </div>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        aria-label={`Ações do cartão ${card.nome}`}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setEditing(card);
                          setFormOpen(true);
                        }}
                      >
                        <Pencil />
                        Editar
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          run(
                            () =>
                              setCardArchivedAction({
                                id: card.id,
                                arquivado: !card.arquivado,
                              }),
                            card.arquivado
                              ? "Cartão desarquivado."
                              : "Cartão arquivado.",
                          )
                        }
                      >
                        {card.arquivado ? <ArchiveRestore /> : <Archive />}
                        {card.arquivado ? "Desarquivar" : "Arquivar"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onSelect={() => setDeleting(card)}
                      >
                        <Trash2 />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <Link
                  href={`/cartoes/${card.id}?fatura=${invoice.chave}`}
                  className="rounded-lg border border-border p-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring max-sm:rounded-none max-sm:border-x-0 max-sm:border-t-0 max-sm:border-b max-sm:border-border max-sm:p-0 max-sm:pb-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Fatura atual · {formatMonthTitle(invoice.chave)}
                      </p>
                      <p className="tabular text-base font-semibold">
                        {formatCurrency(invoice.total)}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge
                        variant={
                          invoice.vencida
                            ? "destructive"
                            : invoice.status === "parcial"
                              ? "warning"
                              : invoice.status === "paga"
                                ? "success"
                                : "secondary"
                        }
                      >
                        {invoice.vencida ? "vencida" : STATUS_LABELS[invoice.status]}
                      </Badge>
                      <p className="mt-1 text-xs text-muted-foreground">
                        vence {formatDate(invoice.vencimento)}
                      </p>
                    </div>
                  </div>
                </Link>

                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      Limite usado {formatCurrency(card.limiteUsado)} de{" "}
                      {formatCurrency(card.limite)}
                    </span>
                    <span
                      className={cn(
                        "tabular whitespace-nowrap font-medium",
                        card.disponivel < 0
                          ? "text-destructive"
                          : ratio >= 0.8
                            ? tone.text
                            : "text-muted-foreground",
                      )}
                    >
                      {card.disponivel < 0
                        ? `estourou ${formatCurrency(Math.abs(card.disponivel))}`
                        : `disponível ${formatCurrency(card.disponivel)}`}
                    </span>
                  </div>
                  <BudgetProgress
                    gasto={card.limiteUsado}
                    limite={card.limite}
                    label={`Limite usado do cartão ${card.nome}`}
                  />
                  {ratio >= 0.8 && (
                    <p className={cn("text-xs font-medium", tone.text)}>
                      {ratio >= 1
                        ? "Limite do cartão estourado"
                        : `Limite em ${Math.round(ratio * 100)}%`}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {card.contaPagamentoNome
                      ? `Paga pela ${card.contaPagamentoNome}`
                      : "Sem conta de pagamento"}
                  </span>
                  <Link
                    href={`/cartoes/${card.id}?fatura=${invoice.chave}`}
                    className="font-medium text-primary hover:underline"
                  >
                    Ver fatura
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CardFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        card={editing}
        accounts={accounts}
        onSubmit={submitCard}
      />

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir cartão</DialogTitle>
            <DialogDescription>
              {deleting?.comprasCount
                ? `“${deleting.nome}” tem ${deleting.comprasCount} lançamento(s). Arquive o cartão para preservar o histórico.`
                : `Excluir “${deleting?.nome}”? Esta ação não remove lançamentos.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={Boolean(deleting?.comprasCount)}
              onClick={() => {
                if (!deleting) return;
                const card = deleting;
                setDeleting(null);
                run(
                  () => deleteCardAction({ id: card.id }),
                  "Cartão excluído.",
                );
              }}
            >
              Excluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
