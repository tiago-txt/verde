"use client";

import { useRef, useState } from "react";
import {
  ArrowLeftRight,
  Copy,
  CreditCard,
  Pencil,
  Repeat,
  StickyNote,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  const touchStartX = useRef<number | null>(null);
  const [reveal, setReveal] = useState<"left" | "right" | null>(null);
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
    ? "text-info"
    : transaction.tipo === "receita"
      ? "text-success"
      : "text-destructive";

  function handleMainClick() {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (reveal) {
      setReveal(null);
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

  function handleTouchStart(event: React.TouchEvent) {
    touchStartX.current = event.touches[0]?.clientX ?? null;
  }

  function handleTouchEnd(event: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const delta =
      (event.changedTouches[0]?.clientX ?? start) - start;
    if (Math.abs(delta) < 48) return;
    setReveal(delta > 0 ? "left" : "right");
  }

  return (
    <div className="group relative overflow-hidden">
      {/* Ações reveladas por deslize no mobile */}
      {reveal === "left" && (
        <div className="absolute inset-y-0 left-0 flex w-20 items-stretch bg-success/15 lg:hidden">
          <button
            type="button"
            onClick={() => {
              onTogglePaid(transaction, !paid);
              setReveal(null);
            }}
            aria-label={paid ? "Marcar como não pago" : "Marcar como pago"}
            className="flex w-full flex-col items-center justify-center gap-1 text-success"
          >
            {paid ? <ThumbsDown className="h-5 w-5" /> : <ThumbsUp className="h-5 w-5" />}
            <span className="text-[10px]">{paid ? "Desfazer" : "Pagar"}</span>
          </button>
        </div>
      )}
      {reveal === "right" && (
        <div className="absolute inset-y-0 right-0 flex w-36 items-stretch lg:hidden">
          <button
            type="button"
            onClick={() => {
              setReveal(null);
              onEdit(transaction);
            }}
            aria-label={`Editar ${transaction.descricao}`}
            className="flex w-1/2 flex-col items-center justify-center gap-1 bg-info/15 text-info"
          >
            <Pencil className="h-5 w-5" />
            <span className="text-[10px]">Editar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setReveal(null);
              onDelete(transaction);
            }}
            aria-label={`Excluir ${transaction.descricao}`}
            className="flex w-1/2 flex-col items-center justify-center gap-1 bg-destructive/15 text-destructive"
          >
            <Trash2 className="h-5 w-5" />
            <span className="text-[10px]">Excluir</span>
          </button>
        </div>
      )}

      <div
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "relative flex min-h-16 items-center gap-2 bg-card px-3 py-3 transition-[transform,background-color] duration-150 sm:gap-3 sm:px-4",
          !transaction.pago && !isCardPurchase && "bg-muted/10",
          selected && "bg-primary/10",
          reveal === "left" && "translate-x-20",
          reveal === "right" && "-translate-x-36",
        )}
        style={{ touchAction: "pan-y" }}
      >
        {selectionMode && !isCardPurchase && (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelected?.(transaction.id)}
            aria-label={`Selecionar ${transaction.descricao}`}
            className="h-6 w-6 shrink-0"
          />
        )}

        {isTransfer ? (
          <span className="tile grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-info/10 text-info">
            {isInvoicePayment ? (
              <CreditCard className="h-5 w-5" aria-hidden="true" />
            ) : (
              <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
            )}
          </span>
        ) : isCardPurchase ? (
          <span
            className="tile grid h-11 w-11 shrink-0 place-items-center rounded-xl"
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
            className="h-11 w-11 rounded-xl"
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
          className="min-w-0 flex-1 rounded-lg py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "truncate text-[15px] font-semibold",
                !transaction.pago && !isCardPurchase && "text-foreground/80",
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
            {transaction.observacao && (
              <StickyNote
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-label="Tem observação"
              />
            )}
            {transaction.tags.length > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[10px] text-gold"
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

        <div className="flex shrink-0 items-center gap-1">
          <span className={cn("tabular text-base font-bold sm:text-lg", valueColor)}>
            {sign}
            {formatCurrency(transaction.valor)}
          </span>

          {!selectionMode && !isCardPurchase && (
            <button
              type="button"
              onClick={() => onTogglePaid(transaction, !paid)}
              aria-pressed={paid}
              aria-label={paid ? "Marcar como não pago" : "Marcar como pago"}
              title={paid ? "Pago — clique para desfazer" : "Não pago — clique para pagar"}
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center rounded-xl transition-colors",
                paid
                  ? "text-success hover:bg-success/10"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {paid ? (
                <ThumbsUp className="h-6 w-6" />
              ) : (
                <ThumbsDown className="h-6 w-6" />
              )}
            </button>
          )}

          {!selectionMode && (
            <div className="hidden items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 lg:flex">
              {!isCardPurchase && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label={paid ? "Marcar como não pago" : "Marcar como pago"}
                  onClick={() => onTogglePaid(transaction, !paid)}
                >
                  {paid ? (
                    <ThumbsDown className="h-4 w-4" />
                  ) : (
                    <ThumbsUp className="h-4 w-4" />
                  )}
                </Button>
              )}
              {!transaction.faturaChave && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Editar lançamento"
                  onClick={() => onEdit(transaction)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {!transaction.faturaChave && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10"
                  aria-label="Duplicar lançamento"
                  onClick={() => onDuplicate(transaction)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-10 w-10 text-destructive hover:bg-destructive/10 hover:text-destructive"
                aria-label="Excluir lançamento"
                onClick={() => onDelete(transaction)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
