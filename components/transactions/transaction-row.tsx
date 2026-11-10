"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeftRight,
  CheckCircle2,
  Circle,
  Copy,
  Loader2,
  MoreHorizontal,
  Pencil,
  Repeat,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/category-icon";
import { setTransactionPaidAction } from "@/lib/actions/transactions";
import type { TransactionListItem } from "@/lib/db/queries/transactions";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

type TransactionRowProps = {
  transaction: TransactionListItem;
  onEdit: (transaction: TransactionListItem) => void;
  onDelete: (transaction: TransactionListItem) => void;
  onDuplicate: (transaction: TransactionListItem) => void;
  onError: (message: string) => void;
};

export function TransactionRow({
  transaction,
  onEdit,
  onDelete,
  onDuplicate,
  onError,
}: TransactionRowProps) {
  const router = useRouter();
  const [paid, setPaid] = useState(transaction.pago);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPaid(transaction.pago);
  }, [transaction.pago]);

  const isTransfer = transaction.tipo === "transferencia";
  const sign =
    transaction.tipo === "receita"
      ? "+"
      : transaction.tipo === "despesa"
        ? "−"
        : "";
  const valueColor = isTransfer
    ? "text-muted-foreground"
    : transaction.tipo === "receita"
      ? "text-success"
      : "text-destructive";

  const accountLabel = isTransfer
    ? `${transaction.contaNome ?? "Conta"} → ${transaction.contaDestinoNome ?? "Conta"}`
    : transaction.contaNome ?? "Sem conta";

  const visibleTags = transaction.tags.slice(0, 2);
  const extraTags = transaction.tags.length - visibleTags.length;

  function togglePaid() {
    const next = !paid;
    setPaid(next);

    startTransition(async () => {
      const result = await setTransactionPaidAction({
        id: transaction.id,
        pago: next,
      });

      if (!result.ok) {
        setPaid(!next);
        onError(result.error);
        return;
      }

      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3 sm:px-4">
      {isTransfer ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
        </span>
      ) : (
        <CategoryIcon
          icon={transaction.categoriaIcone}
          color={transaction.categoriaCor}
        />
      )}

      <button
        type="button"
        onClick={() => onEdit(transaction)}
        className="min-w-0 flex-1 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">
            {transaction.descricao}
          </span>
          {transaction.recorrenciaId && (
            <Repeat
              className="h-3.5 w-3.5 shrink-0 text-primary"
              aria-label="Lançamento recorrente"
            />
          )}
          {transaction.parcelaGrupoId && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {transaction.parcelaAtual}/{transaction.parcelaTotal}
            </Badge>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="truncate">{accountLabel}</span>
          {!isTransfer && transaction.categoriaNome && (
            <span className="truncate">· {transaction.categoriaNome}</span>
          )}
          {visibleTags.map((tag) => (
            <span key={tag.id} className="text-primary/80">
              #{tag.nome}
            </span>
          ))}
          {extraTags > 0 && <span>+{extraTags}</span>}
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={cn("tabular text-sm font-semibold", valueColor)}>
          {sign}
          {formatCurrency(transaction.valor)}
        </span>
        <button
          type="button"
          onClick={togglePaid}
          disabled={isPending}
          aria-pressed={paid}
          aria-label={paid ? "Marcar como não pago" : "Marcar como pago"}
          className={cn(
            "flex min-h-11 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
            paid
              ? "text-success hover:bg-success/10"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : paid ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <Circle className="h-4 w-4" />
          )}
          <span className="hidden sm:inline">{paid ? "Pago" : "Não pago"}</span>
        </button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label={`Ações de ${transaction.descricao}`}
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(transaction)}>
            <Pencil />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onDuplicate(transaction)}>
            <Copy />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onSelect={() => onDelete(transaction)}
          >
            <Trash2 />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
