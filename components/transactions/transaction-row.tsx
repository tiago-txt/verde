"use client";

import { memo, useRef, useState } from "react";
import {
  ArrowRight,
  Pencil,
  Repeat,
  StickyNote,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { EntityTile } from "@/components/entity-tile";
import type { TransactionListItem } from "@/lib/db/queries/transactions";
import { faturaDaCompra, intervaloDaFatura } from "@/lib/finance/cards";
import { formatCurrency, formatDate, formatMonthShort } from "@/lib/format";
import { transactionRowStatus } from "@/lib/design/row-status";
import { categoryTileColor } from "@/lib/finance/investment-category";
import type { SecondaryInfo } from "@/lib/finance/row-secondary";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

type TransactionRowProps = {
  transaction: TransactionListItem;
  secondaryInfo: SecondaryInfo;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelected?: (id: string) => void;
  onOpenDetails: (transaction: TransactionListItem) => void;
  onEdit: (transaction: TransactionListItem) => void;
  onDelete: (transaction: TransactionListItem) => void;
  onDuplicate: (transaction: TransactionListItem) => void;
  onLongPress?: (transaction: TransactionListItem) => void;
  onTogglePaid: (transaction: TransactionListItem, pago: boolean) => void;
  onChangeCategory?: (transaction: TransactionListItem) => void;
};

/** Hover "de verdade" (mouse/trackpad). Em toque, mantém o toque na linha. */
function canHover(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches
  );
}

function AccountBadge({
  id,
  nome,
  icone,
  cor,
  kind = "conta",
}: {
  id?: string | null;
  nome: string | null;
  icone: string | null;
  cor: string | null;
  kind?: "conta" | "cartao";
}) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <EntityTile
        kind={kind}
        entity={{ id, nome, icone, cor }}
        size="xxs"
        className="rounded-full"
      />
      <span className="truncate">{nome ?? "Sem conta"}</span>
    </span>
  );
}

export const TransactionRow = memo(function TransactionRow({
  transaction,
  secondaryInfo,
  selectionMode = false,
  selected = false,
  onToggleSelected,
  onOpenDetails,
  onEdit,
  onDelete,
  onDuplicate,
  onLongPress,
  onTogglePaid,
  onChangeCategory,
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
          fechamentoCompra:
            transaction.cartaoFechamentoCompra ?? "proxima_fatura",
        })
      : null;
  const sign =
    transaction.tipo === "receita"
      ? "+"
      : transaction.tipo === "despesa"
        ? "−"
        : "";
  const valueColor = isInvoicePayment
    ? "text-clay"
    : isTransfer
      ? "text-info"
      : transaction.tipo === "receita"
        ? "text-primary"
        : "text-clay";
  // Filete neutro à esquerda. A leitura de entrada/saída fica no valor.
  const typeIndicator = "border-l-grout/70";

  const rowStatus = transactionRowStatus({
    pago: paid,
    data: transaction.data,
    today: todayISO(),
  });
  const statusMeta = {
    pago: { label: "Pago", tone: "text-success" },
    pendente: { label: "Pendente", tone: "text-muted-foreground" },
    atrasado: { label: "Atrasado", tone: "text-amber" },
  }[rowStatus];

  const showAccount =
    secondaryInfo === "categoria-conta" || secondaryInfo === "conta";
  const showCategory =
    secondaryInfo === "categoria-conta" || secondaryInfo === "categoria";
  const accountName = isCardPurchase
    ? transaction.cartaoNome
    : transaction.contaNome;
  const destinationName = isInvoicePayment
    ? transaction.cartaoDestinoNome
    : transaction.contaDestinoNome;
  const invoiceCycle =
    isInvoicePayment &&
    transaction.faturaChave &&
    transaction.cartaoDestinoDiaFechamento != null &&
    transaction.cartaoDestinoDiaVencimento != null
      ? intervaloDaFatura(transaction.faturaChave, {
          diaFechamento: transaction.cartaoDestinoDiaFechamento,
          diaVencimento: transaction.cartaoDestinoDiaVencimento,
          fechamentoCompra:
            transaction.cartaoDestinoFechamentoCompra ?? "proxima_fatura",
        })
      : null;
  const budgetCycle = transaction.orcamentoCiclo;
  const hasBudget = Boolean(budgetCycle);
  const categoryColor = categoryTileColor({
    nome: transaction.categoriaNome,
    tipo: transaction.tipo,
    cor: transaction.categoriaCor,
  });
  const hasContact =
    isTransfer ||
    (showAccount && Boolean(accountName)) ||
    (showCategory && Boolean(transaction.categoriaNome));
  const hasSecondary = hasBudget || hasContact;

  const titleBadges = (
    <>
      {transaction.recorrenciaId && (
        <Repeat
          className="h-3.5 w-3.5 shrink-0 text-primary"
          aria-label="Lançamento recorrente"
        />
      )}
      {transaction.parcelaGrupoId && (
        <Badge variant="secondary" className="shrink-0 px-1.5 py-0 text-xs">
          {transaction.parcelaAtual}/{transaction.parcelaTotal}
        </Badge>
      )}
      {isCardPurchase && cardInvoiceKey && (
        <Badge
          variant="outline"
          className="hidden shrink-0 px-1.5 py-0 text-xs sm:inline-flex"
        >
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
          className="inline-flex shrink-0 items-center gap-0.5 text-xs text-gold"
          title={transaction.tags.map((tag) => `#${tag.nome}`).join(" ")}
        >
          <Tag className="h-3 w-3" aria-hidden="true" />
          {transaction.tags.length}
        </span>
      )}
    </>
  );

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

  function handlePointerDown(event: React.PointerEvent<HTMLElement>) {
    if (selectionMode || !onLongPress) return;
    pointerStart.current = { x: event.clientX, y: event.clientY };
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      onLongPress(transaction);
    }, 500);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
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
    <div className="list-row-cv group relative overflow-hidden">
      {/* Ações por deslize permanecem exclusivas do toque. */}
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
            {paid ? (
              <ThumbsDown className="h-5 w-5" />
            ) : (
              <ThumbsUp className="h-5 w-5" />
            )}
            <span className="text-xs">{paid ? "Desfazer" : "Pagar"}</span>
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
            <span className="text-xs">Editar</span>
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
            <span className="text-xs">Excluir</span>
          </button>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        aria-label={`Abrir detalhes de ${transaction.descricao}`}
        onClick={handleMainClick}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          handleMainClick();
        }}
        onPointerDown={handlePointerDown}
        onPointerUp={clearLongPress}
        onPointerMove={handlePointerMove}
        onPointerLeave={clearLongPress}
        onPointerCancel={clearLongPress}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        style={{ touchAction: "pan-y" }}
        className={cn(
          "relative flex min-h-16 items-center gap-2.5 border-l-2 bg-background py-0 pl-2 outline-none transition-[transform,background-color] duration-150 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring max-sm:py-1 sm:min-h-[68px] sm:gap-3",
          typeIndicator,
          selected && "bg-primary/10",
          reveal === "left" && "translate-x-20",
          reveal === "right" && "-translate-x-36",
          !selectionMode && !selected && "lg:hover:bg-forest-container/60",
        )}
      >
        {selectionMode && !isCardPurchase && (
          <Checkbox
            checked={selected}
            onCheckedChange={() => onToggleSelected?.(transaction.id)}
            onClick={(event) => event.stopPropagation()}
            aria-label={`Selecionar ${transaction.descricao}`}
            className="h-6 w-6 shrink-0"
          />
        )}

        {isTransfer ? (
          <EntityTile
            kind={isInvoicePayment ? "fatura" : "transferencia"}
            entity={
              isInvoicePayment
                ? {
                    id: transaction.cartaoDestinoId,
                    nome: transaction.cartaoDestinoNome,
                    cor: transaction.cartaoDestinoCor,
                    icone: "CreditCard",
                  }
                : { id: transaction.id, nome: transaction.descricao }
            }
            plain
            className="h-9 w-9 sm:h-10 sm:w-10"
          />
        ) : isCardPurchase ? (
          <EntityTile
            kind="cartao"
            entity={{
              id: transaction.cartaoId,
              nome: transaction.cartaoNome,
              cor: transaction.cartaoCor,
              icone: transaction.cartaoIcone,
            }}
            plain
            className="h-9 w-9 sm:h-10 sm:w-10"
          />
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (selectionMode) {
                onToggleSelected?.(transaction.id);
                return;
              }
              if (canHover() && onChangeCategory) {
                onChangeCategory(transaction);
                return;
              }
              onOpenDetails(transaction);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Categoria de ${transaction.descricao}`}
            title="Categoria"
            className="tap-48 shrink-0 rounded-[12px] outline-none transition-shadow hover:ring-2 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <EntityTile
              kind="categoria"
              entity={{
                id: transaction.categoriaId,
                nome: transaction.categoriaNome,
                icone: transaction.categoriaIcone,
                cor: categoryColor,
              }}
              plain
              className="h-9 w-9 sm:h-10 sm:w-10"
            />
          </button>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (selectionMode) {
                  onToggleSelected?.(transaction.id);
                  return;
                }
                if (canHover() && !transaction.faturaChave) {
                  onEdit(transaction);
                  return;
                }
                onOpenDetails(transaction);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Abrir ${transaction.descricao}`}
              title="Abrir lançamento"
              className="hover-action group/name -mx-1 flex min-w-0 max-w-full flex-1 items-center gap-1 rounded-md px-1 py-0.5 text-left outline-none transition-colors focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring lg:hover:bg-accent"
            >
              <span
                className={cn(
                  "row-title line-clamp-2 min-w-0 flex-1 break-words underline-offset-4 lg:line-clamp-1 lg:group-hover/name:underline",
                  !paid && !isCardPurchase && "text-foreground/80",
                )}
              >
                {isInvoicePayment
                  ? "Pagamento de fatura"
                  : transaction.descricao}
              </span>
            </button>
            </div>

            <span
              className={cn(
                "tabular shrink-0 whitespace-nowrap pt-0.5 text-right text-sm font-semibold leading-5 sm:text-lg",
                valueColor,
              )}
            >
              {sign}
              {formatCurrency(transaction.valor)}
            </span>
          </div>

          <div className="mt-1 flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              {hasSecondary && (
                <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 overflow-hidden text-xs text-muted-foreground sm:text-sm">
              {isTransfer ? (
                <>
                  <EntityTile
                    kind="conta"
                    entity={{
                      id: transaction.contaId,
                      nome: transaction.contaNome,
                      cor: transaction.contaCor,
                      icone: transaction.contaIcone,
                    }}
                    size="xxs"
                    plain
                    className="shrink-0"
                  />
                  <span className="line-clamp-2 min-w-0 max-w-full break-words lg:line-clamp-1">
                    {transaction.contaNome ?? "Sem conta"}
                  </span>
                  <ArrowRight
                    className="h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <EntityTile
                    kind={isInvoicePayment ? "cartao" : "conta"}
                    entity={
                      isInvoicePayment
                        ? {
                            id: transaction.cartaoDestinoId,
                            nome: transaction.cartaoDestinoNome,
                            cor: transaction.cartaoDestinoCor,
                            icone: transaction.cartaoDestinoIcone,
                          }
                        : {
                            id: transaction.contaDestinoId,
                            nome: transaction.contaDestinoNome,
                            cor: transaction.contaDestinoCor,
                            icone: transaction.contaDestinoIcone,
                          }
                    }
                    size="xxs"
                    plain
                    className="shrink-0"
                  />
                  <span className="line-clamp-2 min-w-0 max-w-full break-words lg:line-clamp-1">
                    {destinationName ?? "Sem conta"}
                  </span>
                </>
              ) : (
                <span className="flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5">
                  {(showAccount && accountName) || (showCategory && transaction.categoriaNome) ? (
                    <EntityTile
                      kind={
                        showAccount && accountName
                          ? isCardPurchase
                            ? "cartao"
                            : "conta"
                          : "categoria"
                      }
                      entity={
                        showAccount && accountName
                          ? isCardPurchase
                            ? {
                                id: transaction.cartaoId,
                                nome: transaction.cartaoNome,
                                cor: transaction.cartaoCor,
                                icone: transaction.cartaoIcone,
                              }
                            : {
                                id: transaction.contaId,
                                nome: transaction.contaNome,
                                cor: transaction.contaCor,
                                icone: transaction.contaIcone,
                              }
                          : {
                              id: transaction.categoriaId,
                              nome: transaction.categoriaNome,
                              cor: categoryColor,
                              icone: transaction.categoriaIcone,
                            }
                      }
                      size="xxs"
                      plain
                      className="shrink-0"
                    />
                  ) : null}
                  {showCategory && transaction.categoriaNome && (
                    <>
                      <span className="line-clamp-2 min-w-0 max-w-full break-words lg:line-clamp-1">
                        {transaction.categoriaNome}
                      </span>
                      {showAccount && accountName && (
                        <span aria-hidden="true" className="shrink-0">
                          ·
                        </span>
                      )}
                    </>
                  )}
                  {showAccount && accountName && (
                    <span className="line-clamp-2 min-w-0 max-w-full break-words lg:line-clamp-1">
                      {accountName}
                    </span>
                  )}
                </span>
              )}
              {isCardPurchase && transaction.orcamentoViaFatura && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="truncate">
                    via fatura de{" "}
                    {formatDate(transaction.orcamentoViaFatura).slice(0, 5)}
                  </span>
                </>
              )}
              {invoiceCycle && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">
                    ciclo {formatDate(invoiceCycle.inicio).slice(0, 5)}–
                    {formatDate(invoiceCycle.fim).slice(0, 5)}
                  </span>
                </>
              )}
              {budgetCycle && (
                <>
                  {hasContact && <span aria-hidden="true">·</span>}
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <EntityTile
                      kind="orcamento"
                      entity={{
                        id: transaction.orcamentoNome,
                        nome: transaction.orcamentoNome,
                        cor: transaction.orcamentoCor,
                        icone: transaction.orcamentoIcone,
                      }}
                      size="xxs"
                      plain
                      className="shrink-0 rounded-[6px]"
                    />
                    <span className="truncate">
                      {transaction.orcamentoNome ?? "Orçamento"}{" "}
                      {formatMonthShort(budgetCycle)}
                    </span>
                  </span>
                </>
              )}
            </span>
          )}
              <span className="mt-1.5 flex min-h-4 items-center gap-1.5 pb-1">
                {titleBadges}
              </span>
            </div>

            {!isCardPurchase ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onTogglePaid(transaction, !paid);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                disabled={selectionMode}
                aria-pressed={paid}
                aria-label={
                  paid ? "Marcar como não pago" : "Marcar como pago"
                }
                title={
                  paid ? "Pago — clique para desfazer" : "Pendente — clique para pagar"
                }
                className={cn(
                  "relative flex h-7 shrink-0 items-center gap-1 text-xs font-medium transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  statusMeta.tone,
                  selectionMode && "opacity-60",
                )}
              >
                {paid ? (
                  <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                )}
                {statusMeta.label}
              </button>
            ) : (
              <span
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1 text-xs font-medium",
                  statusMeta.tone,
                )}
              >
                {paid ? (
                  <ThumbsUp className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <ThumbsDown className="h-4 w-4" aria-hidden="true" />
                )}
                {statusMeta.label}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
