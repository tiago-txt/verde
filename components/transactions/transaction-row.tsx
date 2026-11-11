"use client";

import { useRef } from "react";
import {
  ArrowLeftRight,
  CheckCircle2,
  Circle,
  Copy,
  CreditCard,
  MoreHorizontal,
  Pencil,
  Repeat,
  StickyNote,
  Tag,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CategoryIcon } from "@/components/category-icon";
import type { TransactionListItem } from "@/lib/db/queries/transactions";
import { faturaDaCompra } from "@/lib/finance/cards";
import { formatCurrency, formatMonthShort } from "@/lib/format";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

type TransactionRowProps = {
  transaction: TransactionListItem;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (id: string) => void;
  onOpenDetails: (transaction: TransactionListItem) => void;
  onEdit: (transaction: TransactionListItem) => void;
  onDelete: (transaction: TransactionListItem) => void;
  onDuplicate: (transaction: TransactionListItem) => void;
  onLongPress?: (transaction: TransactionListItem) => void;
  onTogglePaid: (transaction: TransactionListItem, pago: boolean) => void;
};

function AccountBadge({
  nome,
  icone,
  cor,
}: {
  nome: string | null;
  icone: string | null;
  cor: string | null;
}) {
  const Icon = getIcon(icone);

  return (
    <span className="inline-flex min-w-0 items-center gap-1">
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        style={{ color: cor ?? undefined }}
        aria-hidden="true"
      />
      <span className="truncate">{nome ?? "Sem conta"}</span>
    </span>
  );
}

export function TransactionRow({
  transaction,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  onOpenDetails,
  onEdit,
  onDelete,
  onDuplicate,
  onLongPress,
  onTogglePaid,
}: TransactionRowProps) {
  const longPressTimer = useRef<number | null>(null);
  const longPressTriggered = useRef(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const paid = transaction.pago;

  const isTransfer = transaction.tipo === "transferencia";
  const isCardPurchase = Boolean(transaction.cartaoId);
  const isInvoicePayment = Boolean(transaction.cartaoDestinoId);
  const cardInvoiceKey =
    isCardPurchase &&
    transaction.cartaoDiaFechamento &&
    transaction.cartaoDiaVencimento
      ? faturaDaCompra(transaction.data, {
          diaFechamento: transaction.cartaoDiaFechamento,
          diaVencimento: transaction.cartaoDiaVencimento,
        })
      : null;
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

  function handleMainClick() {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (selectionMode) onToggleSelected?.(transaction.id);
    else onOpenDetails(transaction);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (selectionMode || !onLongPress) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress(transaction);
    }, 500);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    const start = pointerStart.current;
    if (!start) return;
    if (
      Math.abs(event.clientX - start.x) > 10 ||
      Math.abs(event.clientY - start.y) > 10
    ) {
      clearLongPress();
    }
  }

  function clearLongPress() {
    pointerStart.current = null;
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2.5 transition-colors hover:bg-accent/40 sm:gap-3 sm:px-4",
        !transaction.pago && "bg-muted/15",
        selected && "bg-primary/10",
      )}
    >
      {selectionMode && !isCardPurchase && (
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggleSelected?.(transaction.id)}
          aria-label={`Selecionar ${transaction.descricao}`}
          className="shrink-0"
        />
      )}

      {isTransfer ? (
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          {isInvoicePayment ? (
            <CreditCard className="h-5 w-5" aria-hidden="true" />
          ) : (
            <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
      ) : isCardPurchase ? (
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
          style={{
            backgroundColor: `${transaction.cartaoCor ?? "#818cf8"}22`,
            color: transaction.cartaoCor ?? "#818cf8",
          }}
        >
          <CreditCard className="h-5 w-5" aria-hidden="true" />
        </span>
      ) : (
        <CategoryIcon
          icon={transaction.categoriaIcone}
          color={transaction.categoriaCor}
        />
      )}

      <button
        type="button"
        onClick={handleMainClick}
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerMove={handlePointerMove}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        className="min-w-0 flex-1 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex flex-wrap items-center gap-1.5">
          <span
            className={cn(
              "truncate text-sm font-medium",
              !transaction.pago && "text-muted-foreground",
            )}
          >
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
          {isCardPurchase && cardInvoiceKey && (
            <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
              Fatura {formatMonthShort(cardInvoiceKey)}
            </Badge>
          )}
          {isCardPurchase && (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              Informativa
            </Badge>
          )}
          {transaction.observacao && (
            <StickyNote
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
              aria-label="Tem observação"
            />
          )}
          {transaction.tags.length > 0 && (
            <span
              className="inline-flex items-center gap-0.5 text-[10px] text-primary/80"
              title={transaction.tags.map((tag) => `#${tag.nome}`).join(" ")}
            >
              <Tag className="h-3 w-3" aria-hidden="true" />
              {transaction.tags.length}
            </span>
          )}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {isTransfer ? (
            <>
              <AccountBadge
                nome={transaction.contaNome}
                icone={transaction.contaIcone}
                cor={transaction.contaCor}
              />
              <span aria-hidden="true">→</span>
              {isInvoicePayment ? (
                <AccountBadge
                  nome={transaction.cartaoDestinoNome}
                  icone="CreditCard"
                  cor={transaction.cartaoDestinoCor}
                />
              ) : (
                <AccountBadge
                  nome={transaction.contaDestinoNome}
                  icone={transaction.contaDestinoIcone}
                  cor={transaction.contaDestinoCor}
                />
              )}
            </>
          ) : isCardPurchase ? (
            <>
              <AccountBadge
                nome={transaction.cartaoNome}
                icone="CreditCard"
                cor={transaction.cartaoCor}
              />
              {transaction.categoriaNome && (
                <span className="truncate">· {transaction.categoriaNome}</span>
              )}
            </>
          ) : (
            <>
              <AccountBadge
                nome={transaction.contaNome}
                icone={transaction.contaIcone}
                cor={transaction.contaCor}
              />
              {transaction.categoriaNome && (
                <span className="truncate">· {transaction.categoriaNome}</span>
              )}
            </>
          )}
        </span>
      </button>

      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <span className={cn("tabular text-sm font-semibold", valueColor)}>
          {sign}
          {formatCurrency(transaction.valor)}
        </span>
        {!selectionMode && !isCardPurchase && (
          <button
            type="button"
            onClick={() => onTogglePaid(transaction, !paid)}
            aria-pressed={paid}
            aria-label={paid ? "Marcar como não pago" : "Marcar como pago"}
            className={cn(
              "flex min-h-11 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium transition-colors",
              paid
                ? "text-success hover:bg-success/10"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            {paid ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <Circle className="h-4 w-4" />
            )}
            <span className="hidden sm:inline">
              {paid ? "Pago" : "Não pago"}
            </span>
          </button>
        )}
      </div>

      {!selectionMode && (
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
            {!transaction.faturaChave && (
              <DropdownMenuItem onSelect={() => onEdit(transaction)}>
                <Pencil />
                Editar
              </DropdownMenuItem>
            )}
            {!transaction.faturaChave && (
              <DropdownMenuItem onSelect={() => onDuplicate(transaction)}>
                <Copy />
                Duplicar
              </DropdownMenuItem>
            )}
            {!transaction.faturaChave && <DropdownMenuSeparator />}
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onSelect={() => onDelete(transaction)}
            >
              <Trash2 />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
