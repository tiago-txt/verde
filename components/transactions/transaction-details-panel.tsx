"use client";

import { useEffect, useState, useTransition } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Copy,
  Loader2,
  Paperclip,
  Pencil,
  Repeat,
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
import { CategoryIcon } from "@/components/category-icon";
import { FormError } from "@/components/form-feedback";
import type { TransactionDetail } from "@/lib/db/queries/transactions";
import type { RecurrenceFrequency } from "@/lib/db/schema";
import { faturaDaCompra } from "@/lib/finance/cards";
import { formatCurrency, formatDate, formatMonthShort } from "@/lib/format";
import { getIcon } from "@/lib/icons";
import { cn } from "@/lib/utils";

const FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  mensal: "mensal",
  semanal: "semanal",
  anual: "anual",
};

const TYPE_LABELS = {
  despesa: "Despesa",
  receita: "Receita",
  transferencia: "Transferência",
} as const;

const TYPE_BADGE = {
  despesa: "destructive",
  receita: "success",
  transferencia: "secondary",
} as const;

type TransactionDetailsPanelProps = {
  detail: TransactionDetail | null;
  onClose: () => void;
  onEdit: (transaction: TransactionDetail) => void;
  onDelete: (transaction: TransactionDetail) => void;
  onDuplicate: (transaction: TransactionDetail) => void;
  onNavigate: (id: string) => void;
  onTogglePaid: (
    id: string,
    pago: boolean,
  ) => Promise<{ ok: boolean; error?: string }>;
};

function AccountLine({
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
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Icon
        className="h-4 w-4 shrink-0"
        style={{ color: cor ?? undefined }}
        aria-hidden="true"
      />
      <span className="truncate">{nome ?? "Sem conta"}</span>
    </span>
  );
}

export function TransactionDetailsPanel({
  detail,
  onClose,
  onEdit,
  onDelete,
  onDuplicate,
  onNavigate,
  onTogglePaid,
}: TransactionDetailsPanelProps) {
  const [paid, setPaid] = useState(detail?.pago ?? false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setPaid(detail?.pago ?? false);
    setError(null);
  }, [detail?.id, detail?.pago]);

  if (!detail) return null;

  const detailId = detail.id;
  const isTransfer = detail.tipo === "transferencia";
  const isCardPurchase = Boolean(detail.cartaoId);
  const isInvoicePayment = Boolean(detail.cartaoDestinoId);
  const cardInvoiceKey =
    isCardPurchase &&
    detail.cartaoDiaFechamento &&
    detail.cartaoDiaVencimento
      ? faturaDaCompra(detail.data, {
          diaFechamento: detail.cartaoDiaFechamento,
          diaVencimento: detail.cartaoDiaVencimento,
          fechamentoCompra:
            detail.cartaoFechamentoCompra ?? "proxima_fatura",
        })
      : null;
  const sign =
    detail.tipo === "receita" ? "+" : detail.tipo === "despesa" ? "−" : "";
  const valueColor = isTransfer
    ? "text-muted-foreground"
    : detail.tipo === "receita"
      ? "text-success"
      : "text-destructive";

  const fixedTypeLabel =
    detail.tipo === "despesa"
      ? "Despesa"
      : detail.tipo === "receita"
        ? "Receita"
        : "Transferência";
  const recurrenceTitle = detail.parcelaGrupoId
    ? `Parcela ${detail.parcelaAtual}/${detail.parcelaTotal}`
    : `${fixedTypeLabel} fixa · ${
        detail.recorrenciaFrequencia
          ? FREQUENCY_LABELS[detail.recorrenciaFrequencia]
          : "recorrente"
      }`;

  function togglePaid() {
    const next = !paid;
    setPaid(next);
    setError(null);

    startTransition(async () => {
      const result = await onTogglePaid(detailId, next);
      if (!result.ok) {
        setPaid(!next);
        setError(result.error ?? "Não foi possível atualizar o pagamento.");
      }
    });
  }

  return (
    <Dialog
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        variant="right-panel"
        showClose
        hideOverlayOnDesktop
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <div className="flex h-full flex-col">
          <div className="border-b border-border p-5 pr-12">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={TYPE_BADGE[detail.tipo]}>
                {isCardPurchase && detail.tipo === "receita"
                  ? "Estorno/crédito"
                  : TYPE_LABELS[detail.tipo]}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {formatDate(detail.data)}
              </span>
            </div>
            <DialogHeader className="mt-2">
              <DialogTitle className="text-xl">{detail.descricao}</DialogTitle>
              <DialogDescription>
                {isInvoicePayment
                  ? "Pagamento de fatura"
                  : isCardPurchase
                    ? `Compra no cartão${cardInvoiceKey ? ` · fatura ${formatMonthShort(cardInvoiceKey)}` : ""}`
                    : isTransfer
                      ? "Transferência entre contas"
                      : detail.categoriaNome ?? "Outros"}
              </DialogDescription>
            </DialogHeader>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-5">
            <p className={cn("tabular text-3xl font-semibold", valueColor)}>
              {sign}
              {formatCurrency(detail.valor)}
            </p>

            {(detail.recorrenciaId || detail.parcelaGrupoId) && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Repeat className="h-4 w-4 text-primary" />
                      {recurrenceTitle}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {detail.occurrenceIndex && detail.occurrenceCount
                        ? `Ocorrência ${detail.occurrenceIndex} de ${detail.occurrenceCount}`
                        : formatDate(detail.data)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11"
                      aria-label="Ocorrência anterior"
                      disabled={!detail.prevId}
                      onClick={() =>
                        detail.prevId && onNavigate(detail.prevId)
                      }
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11"
                      aria-label="Próxima ocorrência"
                      disabled={!detail.nextId}
                      onClick={() =>
                        detail.nextId && onNavigate(detail.nextId)
                      }
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <dl className="space-y-3 text-sm">
              {!isTransfer && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Categoria</dt>
                  <dd className="flex min-w-0 items-center gap-2">
                    <CategoryIcon
                      icon={detail.categoriaIcone}
                      color={detail.categoriaCor}
                      className="h-7 w-7"
                      iconClassName="h-3.5 w-3.5"
                    />
                    <span className="truncate">
                      {detail.categoriaNome ?? "Outros"}
                    </span>
                  </dd>
                </div>
              )}

              {!isTransfer && detail.orcamentoCiclo && (
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-muted-foreground">Orçamento</dt>
                  <dd className="min-w-0 text-right">
                    <span className="block truncate">
                      {detail.orcamentoNome ?? "Orçamento"} ·{" "}
                      {formatMonthShort(detail.orcamentoCiclo)}
                    </span>
                    {detail.orcamentoViaFatura && (
                      <span className="block text-xs text-muted-foreground">
                        via fatura de{" "}
                        {formatDate(detail.orcamentoViaFatura).slice(0, 5)}
                      </span>
                    )}
                  </dd>
                </div>
              )}

              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">
                  {isTransfer ? "Contas" : isCardPurchase ? "Cartão" : "Conta"}
                </dt>
                <dd className="flex min-w-0 items-center gap-1.5">
                  {isCardPurchase ? (
                    <>
                      <AccountLine
                        nome={detail.cartaoNome}
                        icone="CreditCard"
                        cor={detail.cartaoCor}
                      />
                      {cardInvoiceKey && (
                        <span className="text-xs text-muted-foreground">
                          {detail.orcamentoViaFatura
                            ? `· via fatura de ${formatDate(detail.orcamentoViaFatura).slice(0, 5)}`
                            : `· fatura ${formatMonthShort(cardInvoiceKey)}`}
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <AccountLine
                        nome={detail.contaNome}
                        icone={detail.contaIcone}
                        cor={detail.contaCor}
                      />
                      {isInvoicePayment ? (
                        <>
                          <span aria-hidden="true">→</span>
                          <AccountLine
                            nome={detail.cartaoDestinoNome}
                            icone="CreditCard"
                            cor={detail.cartaoDestinoCor}
                          />
                        </>
                      ) : (
                        isTransfer && (
                          <>
                            <span aria-hidden="true">→</span>
                            <AccountLine
                              nome={detail.contaDestinoNome}
                              icone={detail.contaDestinoIcone}
                              cor={detail.contaDestinoCor}
                            />
                          </>
                        )
                      )}
                    </>
                  )}
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="text-muted-foreground">Data</dt>
                <dd>{formatDate(detail.data)}</dd>
              </div>

              <div className="flex items-start justify-between gap-4">
                <dt className="pt-1 text-muted-foreground">Tags</dt>
                <dd className="flex flex-wrap justify-end gap-1">
                  {detail.tags.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    detail.tags.map((tag) => (
                      <Badge key={tag.id} variant="outline">
                        #{tag.nome}
                      </Badge>
                    ))
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex min-h-16 items-center justify-center gap-2 rounded-lg border border-dashed border-border text-xs text-muted-foreground">
              <Paperclip className="h-4 w-4" />
              Adicionar anexo (em breve)
            </div>

            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Observação
              </p>
              <p className="whitespace-pre-wrap text-sm">
                {detail.observacao || "Sem observação."}
              </p>
            </div>

            <FormError message={error} />
          </div>

          <div className="border-t border-border p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <DialogFooter className="flex-row flex-wrap items-center justify-between gap-2">
              {isCardPurchase ? (
                <p className="text-xs text-muted-foreground">
                  Status derivado da fatura
                  {cardInvoiceKey
                    ? ` de ${formatMonthShort(cardInvoiceKey)}`
                    : ""}
                  .
                </p>
              ) : (
                <Button
                  type="button"
                  variant={paid ? "outline" : "default"}
                  onClick={togglePaid}
                  disabled={isPending}
                  aria-pressed={paid}
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : paid ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Circle className="h-4 w-4" />
                  )}
                  {paid ? "Marcar não pago" : "Marcar pago"}
                </Button>
              )}

              <div className="flex items-center gap-1">
                {!detail.faturaChave && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onEdit(detail)}
                  >
                    <Pencil className="h-4 w-4" />
                    Editar
                  </Button>
                )}
                {!detail.faturaChave && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11"
                    aria-label="Duplicar lançamento"
                    title="Duplicar"
                    onClick={() => onDuplicate(detail)}
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Excluir lançamento"
                  title="Excluir"
                  onClick={() => onDelete(detail)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
