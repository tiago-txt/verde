"use client";

import { memo, useRef, useState } from "react";
import {
  ArrowRight,
  Pencil,
  Repeat,
  StickyNote,
  Tag,
  Target,
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
import type { SecondaryInfo } from "@/lib/finance/row-secondary";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
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
        size="xs"
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
  const isMobile = useIsMobile();
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
  const valueColor = isTransfer
    ? "text-info"
    : transaction.tipo === "receita"
      ? "text-primary"
      : "text-clay";
  const barColor = isTransfer
    ? "bg-info"
    : transaction.tipo === "receita"
      ? "bg-primary"
      : "bg-clay";

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
    secondaryInfo === "conta-categoria" || secondaryInfo === "conta";
  const showCategory =
    secondaryInfo === "conta-categoria" || secondaryInfo === "categoria";
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
  const hasSecondary =
    hasBudget ||
    isTransfer ||
    (showAccount && Boolean(accountName)) ||
    (showCategory && Boolean(transaction.categoriaNome));

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

  if (isMobile) {
    return (
      <div className="list-row-cv group relative overflow-hidden">
        {reveal === "left" && (
          <div className="absolute inset-y-0 left-0 flex w-20 items-stretch bg-success/15">
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
          <div className="absolute inset-y-0 right-0 flex w-36 items-stretch">
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
          onClick={handleMainClick}
          onPointerDown={handlePointerDown}
          onPointerUp={clearLongPress}
          onPointerMove={handlePointerMove}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
          style={{ touchAction: "pan-y" }}
          className={cn(
            "relative flex min-h-16 items-center gap-3 bg-background px-0 transition-[transform,background-color] duration-150",
            selected && "bg-primary/10",
            reveal === "left" && "translate-x-20",
            reveal === "right" && "-translate-x-36",
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
              plain className="h-10 w-10"
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
              plain className="h-10 w-10"
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
                onOpenDetails(transaction);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Categoria de ${transaction.descricao}`}
              className="tap-48 shrink-0 rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <EntityTile
                kind="categoria"
                entity={{
                  id: transaction.categoriaId,
                  nome: transaction.categoriaNome,
                  icone: transaction.categoriaIcone,
                  cor: transaction.categoriaCor,
                }}
                plain className="h-10 w-10"
              />
            </button>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="row-title min-w-0 truncate">
                {isInvoicePayment ? "Pagamento de fatura" : transaction.descricao}
              </span>
              {transaction.recorrenciaId && (
                <Repeat
                  className="h-3.5 w-3.5 shrink-0 text-primary"
                  aria-label="Lançamento recorrente"
                />
              )}
              {budgetCycle && (
                <Target
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-label={
                    transaction.orcamentoNome
                      ? `Orçamento ${transaction.orcamentoNome}`
                      : "Lançamento vinculado a orçamento"
                  }
                />
              )}
              {transaction.parcelaGrupoId && (
                <Badge
                  variant="secondary"
                  className="shrink-0 px-1.5 py-0 text-xs"
                >
                  {transaction.parcelaAtual}/{transaction.parcelaTotal}
                </Badge>
              )}
              {transaction.observacao && (
                <StickyNote
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                  aria-label="Tem observação"
                />
              )}
            </div>
            {hasSecondary && (
              <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 overflow-hidden text-[13px] text-muted-foreground">
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
                    <span className="truncate">
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
                    <span className="truncate">
                      {destinationName ?? "Sem conta"}
                    </span>
                  </>
                ) : (
                  <span className="inline-flex min-w-0 items-center gap-1.5">
                    {showAccount && accountName && (
                      <>
                        <EntityTile
                          kind={isCardPurchase ? "cartao" : "conta"}
                          entity={
                            isCardPurchase
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
                          }
                          size="xxs"
                          plain
                          className="shrink-0"
                        />
                        <span className="truncate">{accountName}</span>
                        {showCategory && transaction.categoriaNome && (
                          <span aria-hidden="true" className="shrink-0">
                            ·
                          </span>
                        )}
                      </>
                    )}
                    {showCategory && transaction.categoriaNome && (
                      <span className="truncate">
                        {transaction.categoriaNome}
                      </span>
                    )}
                  </span>
                )}
                {budgetCycle && (
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span
                      aria-hidden="true"
                      className="shrink-0 max-[429px]:hidden"
                    >
                      ·
                    </span>
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
                      className="shrink-0"
                    />
                    <span className="truncate">
                      {transaction.orcamentoNome ?? "Orçamento"}{" "}
                      {formatMonthShort(budgetCycle)}
                    </span>
                  </span>
                )}
              </span>
            )}
          </div>

          <div className="flex h-16 shrink-0 translate-y-1 flex-col items-end justify-center">
            <span
              className={cn(
                "tabular whitespace-nowrap text-base font-semibold leading-4",
                valueColor,
              )}
            >
              {sign}
              {formatCurrency(transaction.valor)}
            </span>
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
                paid
                  ? "Pago — toque para desfazer"
                  : "Pendente — toque para pagar"
              }
              className={cn(
                "relative flex h-8 items-center gap-1 text-xs font-medium",
                statusMeta.tone,
                selectionMode && "opacity-60",
              )}
            >
              <span
                aria-hidden="true"
                className="absolute -inset-x-2 -inset-y-2"
              />
              {paid ? (
                <ThumbsUp className="h-4 w-4" aria-hidden="true" />
              ) : (
                <ThumbsDown className="h-4 w-4" aria-hidden="true" />
              )}
              {statusMeta.label}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative overflow-hidden rounded-lg border border-grout/80 bg-surface-low shadow-[0_4px_16px_rgba(7,16,11,0.45)]">
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-0 left-0 z-10 w-[3px] transition-[width] duration-150 lg:group-hover:w-1",
          barColor,
        )}
      />
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
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={cn(
          "relative flex min-h-[72px] flex-wrap items-center gap-2 bg-surface-low px-3 py-3 transition-[transform,background-color] duration-150 sm:gap-3 sm:px-4",
          !transaction.pago && !isCardPurchase && "bg-forest-container/40",
          selected && "bg-primary/10",
          !selectionMode && !selected && "lg:hover:bg-forest-container",
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
            className="h-10 w-10 sm:h-12 sm:w-12"
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
            className="h-10 w-10 sm:h-12 sm:w-12"
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
              if (!canHover()) {
                onOpenDetails(transaction);
                return;
              }
              onChangeCategory?.(transaction);
            }}
            onPointerDown={(event) => event.stopPropagation()}
            aria-label={`Trocar categoria de ${transaction.descricao}`}
            title="Trocar categoria"
            className="hover-action group/cat relative shrink-0 rounded-[12px] outline-none transition-shadow hover:ring-2 hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <EntityTile
              kind="categoria"
              entity={{
                id: transaction.categoriaId,
                nome: transaction.categoriaNome,
                icone: transaction.categoriaIcone,
                cor: transaction.categoriaCor,
              }}
              className="h-10 w-10 transition-transform group-hover/cat:scale-105 sm:h-12 sm:w-12"
            />
            <span
              className="pointer-events-none absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-primary/40 bg-primary-fill text-primary-fill-foreground opacity-0 shadow-sm transition-opacity group-hover/cat:opacity-100 group-focus-visible/cat:opacity-100"
              aria-hidden="true"
            >
              <Pencil className="h-3.5 w-3.5" />
            </span>
          </button>
        )}

        <div
          role="button"
          tabIndex={0}
          aria-label={`Abrir detalhes de ${transaction.descricao}`}
          onClick={handleMainClick}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            handleMainClick();
          }}
          onPointerDown={handlePointerDown}
          onPointerUp={clearLongPress}
          onPointerMove={handlePointerMove}
          onPointerLeave={clearLongPress}
          onPointerCancel={clearLongPress}
          className="min-w-[10rem] flex-1 cursor-pointer rounded-lg py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (selectionMode) {
                  onToggleSelected?.(transaction.id);
                  return;
                }
                if (!canHover() || transaction.faturaChave) {
                  onOpenDetails(transaction);
                  return;
                }
                onEdit(transaction);
              }}
              onPointerDown={(event) => event.stopPropagation()}
              aria-label={`Editar ${transaction.descricao}`}
              title="Editar lançamento"
              className="hover-action group/name -mx-1 flex min-w-0 max-w-full items-center gap-1 rounded-md px-1 py-0.5 text-left outline-none transition-colors hover:bg-accent focus-visible:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "row-title truncate underline-offset-4 group-hover/name:underline",
                  !transaction.pago && !isCardPurchase && "text-foreground/80",
                )}
              >
                {transaction.descricao}
              </span>
              <Pencil
                className="h-3.5 w-3.5 shrink-0 text-primary opacity-0 transition-opacity group-hover/name:opacity-100 group-focus-visible/name:opacity-100"
                aria-hidden="true"
              />
            </button>
            {transaction.recorrenciaId && (
              <Repeat
                className="h-3.5 w-3.5 shrink-0 text-primary"
                aria-label="Lançamento recorrente"
              />
            )}
            {transaction.parcelaGrupoId && (
              <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                {transaction.parcelaAtual}/{transaction.parcelaTotal}
              </Badge>
            )}
            {isCardPurchase && cardInvoiceKey && (
              <Badge variant="outline" className="px-1.5 py-0 text-xs">
                Fatura {formatMonthShort(cardInvoiceKey)}
              </Badge>
            )}
            {budgetCycle && (
              <Target
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-label={
                  transaction.orcamentoNome
                    ? `Orçamento ${transaction.orcamentoNome}`
                    : "Lançamento vinculado a orçamento"
                }
              />
            )}
            {transaction.observacao && (
              <StickyNote
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                aria-label="Tem observação"
              />
            )}
            {transaction.tags.length > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-xs text-gold"
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
                  id={transaction.contaId}
                  nome={transaction.contaNome}
                  icone={transaction.contaIcone}
                  cor={transaction.contaCor}
                />
                <span aria-hidden="true">→</span>
                {isInvoicePayment ? (
                  <AccountBadge
                    id={transaction.cartaoDestinoId}
                    nome={transaction.cartaoDestinoNome}
                    icone={transaction.cartaoDestinoIcone}
                    cor={transaction.cartaoDestinoCor}
                    kind="cartao"
                  />
                ) : (
                  <AccountBadge
                    id={transaction.contaDestinoId}
                    nome={transaction.contaDestinoNome}
                    icone={transaction.contaDestinoIcone}
                    cor={transaction.contaDestinoCor}
                  />
                )}
              </>
            ) : isCardPurchase ? (
              <>
                <AccountBadge
                  id={transaction.cartaoId}
                  nome={transaction.cartaoNome}
                  icone={transaction.cartaoIcone}
                  cor={transaction.cartaoCor}
                  kind="cartao"
                />
                {transaction.categoriaNome && (
                  <span className="truncate">· {transaction.categoriaNome}</span>
                )}
                {transaction.orcamentoViaFatura && (
                  <span className="truncate">
                    · via fatura de{" "}
                    {formatDate(transaction.orcamentoViaFatura).slice(0, 5)}
                  </span>
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
                <span aria-hidden="true">·</span>
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
                    className="shrink-0"
                  />
                  <span className="truncate">
                    {transaction.orcamentoNome ?? "Orçamento"}{" "}
                    {formatMonthShort(budgetCycle)}
                  </span>
                </span>
              </>
            )}
          </span>
        </div>

        <div className="row-slot">
          <span className={cn("row-value row-amount", valueColor)}>
            {sign}
            {formatCurrency(transaction.valor)}
          </span>

          {!isCardPurchase ? (
            <button
              type="button"
              onClick={() => onTogglePaid(transaction, !paid)}
              disabled={selectionMode}
              aria-pressed={paid}
              aria-label={paid ? "Marcar como não pago" : "Marcar como pago"}
              title={paid ? "Pago — clique para desfazer" : "Não pago — clique para pagar"}
              className={cn(
                "grid h-12 w-12 shrink-0 place-items-center rounded-lg border border-grout bg-forest-container transition-colors",
                paid
                  ? "text-primary hover:bg-primary/10"
                  : "text-muted-foreground hover:bg-forest-high hover:text-foreground",
                selectionMode && "opacity-80 hover:bg-transparent",
              )}
            >
              {paid ? (
                <ThumbsUp className="h-6 w-6" />
              ) : (
                <ThumbsDown className="h-6 w-6" />
              )}
            </button>
          ) : (
            <span className="h-12 w-12 shrink-0" aria-hidden="true" />
          )}
        </div>
      </div>
    </div>
  );
});
