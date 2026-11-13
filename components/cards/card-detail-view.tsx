"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Loader2,
  Plus,
  ReceiptText,
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
import { NativeSelect } from "@/components/ui/native-select";
import { CurrencyInput } from "@/components/currency-input";
import { DatePicker } from "@/components/calendar/date-picker";
import { FormError } from "@/components/form-feedback";
import { useToast } from "@/components/ui/toast";
import { BudgetProgress, budgetTone } from "@/components/budgets/budget-progress";
import { PaymentProgress } from "@/components/cards/payment-progress";
import { TransactionFormDialog } from "@/components/transactions/transaction-form-dialog";
import {
  deleteTransactionAction,
  setTransactionPaidAction,
} from "@/lib/actions/transactions";
import { payInvoiceAction } from "@/lib/actions/cards";
import type { CardInvoiceDetail } from "@/lib/db/queries/cards";
import type { TransactionFormData } from "@/lib/db/queries/transactions";
import { addMonths, todayISO } from "@/lib/dates";
import { intervaloDaFatura } from "@/lib/finance/cards";
import { formatCurrency, formatDate, formatMonthTitle, formatMonthShort } from "@/lib/format";
import { EntityTile } from "@/components/entity-tile";
import { cn } from "@/lib/utils";

type CardDetailViewProps = {
  detail: CardInvoiceDetail;
  formData: TransactionFormData | null;
  accounts: { id: string; nome: string; arquivada: boolean }[];
  embedded?: boolean;
  initialPay?: boolean;
  onChanged?: () => void;
};

const STATUS_LABELS = {
  aberta: "aberta",
  fechada: "fechada",
  parcial: "parcial",
  paga: "paga",
} as const;

export function CardDetailView({
  detail,
  formData,
  accounts,
  embedded = false,
  initialPay = false,
  onChanged,
}: CardDetailViewProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(initialPay);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payAccountId, setPayAccountId] = useState(
    detail.card.contaPagamentoId ??
      detail.contaPagamento?.id ??
      accounts.find((account) => !account.arquivada)?.id ??
      "",
  );
  const [payValue, setPayValue] = useState(detail.fatura.restante);
  const [payDate, setPayDate] = useState(todayISO());

  useEffect(() => {
    if (initialPay) setPayOpen(true);
  }, [initialPay]);

  useEffect(() => {
    function openPurchase() {
      setPurchaseOpen(true);
    }
    window.addEventListener("verde:new-transaction", openPurchase);
    return () =>
      window.removeEventListener("verde:new-transaction", openPurchase);
  }, []);

  useEffect(() => {
    if (!payOpen) return;
    setError(null);
    setPayAccountId(
      detail.card.contaPagamentoId ??
        detail.contaPagamento?.id ??
        accounts.find((account) => !account.arquivada)?.id ??
        "",
    );
    setPayValue(detail.fatura.restante);
    setPayDate(todayISO());
  }, [payOpen, detail.card.contaPagamentoId, detail.contaPagamento?.id, detail.fatura.restante, accounts]);

  const groupedPurchases = useMemo(() => {
    const map = new Map<string, CardInvoiceDetail["purchases"]>();
    for (const purchase of detail.purchases) {
      const list = map.get(purchase.data) ?? [];
      list.push(purchase);
      map.set(purchase.data, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [detail.purchases]);

  const fatura = detail.fatura;
  const cycle = intervaloDaFatura(fatura.chave, detail.card);
  const tone = budgetTone(detail.limiteUsado, detail.card.limite);
  const ratio =
    detail.card.limite > 0 ? detail.limiteUsado / detail.card.limite : 0;
  const canPay = fatura.restante > 0;

  function navigate(chave: string) {
    router.push(`/cartoes/${detail.card.id}?fatura=${chave}`);
  }

  function pay() {
    if (!payAccountId || payValue <= 0) return;
    setError(null);
    startTransition(async () => {
      const result = await payInvoiceAction({
        cartaoId: detail.card.id,
        faturaChave: fatura.chave,
        contaId: payAccountId,
        valor: payValue,
        data: payDate,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPayOpen(false);
      if (result.notice) {
        toast({
          description: result.notice.message,
          tone: result.notice.tone,
        });
      }
      router.refresh();
      onChanged?.();
    });
  }

  function undoPayment(id: string) {
    setError(null);
    startTransition(async () => {
      const result = await deleteTransactionAction({ id, scope: "single" });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ description: "Pagamento desfeito; fatura reaberta.", tone: "success" });
      router.refresh();
      onChanged?.();
    });
  }

  function togglePaymentPaid(id: string, pago: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setTransactionPaidAction({ id, pago });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({
        description: pago ? "Pagamento confirmado." : "Pagamento marcado como não pago.",
        tone: "success",
      });
      router.refresh();
      onChanged?.();
    });
  }

  return (
    <div className="space-y-4">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold">
              Fatura {detail.card.nome}
            </p>
            <p className="text-xs text-muted-foreground">
              {formatMonthTitle(fatura.chave)} · vence em{" "}
              {formatDate(fatura.vencimento)}
            </p>
          </div>
          <Button
            type="button"
            className="h-11"
            onClick={() => setPayOpen(true)}
            disabled={!canPay}
          >
            <Check className="h-4 w-4" />
            Pagar fatura
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-3">
        <Link
          href="/cartoes"
          className="mt-1 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Voltar para cartões"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>

        <EntityTile
          kind="cartao"
          entity={{
            id: detail.card.id,
            nome: detail.card.nome,
            cor: detail.card.cor,
            icone: detail.card.icone,
          }}
        />

        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-semibold">{detail.card.nome}</h1>
          <p className="text-xs text-muted-foreground">
            Fecha dia {detail.card.diaFechamento} · vence dia{" "}
            {detail.card.diaVencimento}
            {detail.card.contaPagamentoNome
              ? ` · paga pela ${detail.card.contaPagamentoNome}`
              : ""}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Fatura anterior"
            onClick={() => navigate(addMonths(fatura.chave, -1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[140px] text-center text-sm font-semibold">
            {formatMonthTitle(fatura.chave)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Próxima fatura"
            onClick={() => navigate(addMonths(fatura.chave, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            onClick={() => setPurchaseOpen(true)}
            disabled={detail.card.arquivado}
            title={
              detail.card.arquivado
                ? "Cartão arquivado não aceita novas compras"
                : undefined
            }
          >
            <Plus className="h-4 w-4" />
            Compra
          </Button>
          <Button
            type="button"
            className="h-11"
            onClick={() => setPayOpen(true)}
            disabled={!canPay}
          >
            <Check className="h-4 w-4" />
            Pagar fatura
          </Button>
        </div>
        </div>
      )}

      <FormError message={error} />

      <div
        className={cn(
          "grid gap-3",
          !embedded && "lg:grid-cols-[1.2fr_1fr]",
        )}
      >
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs text-muted-foreground">
                Período do ciclo
              </p>
              <p className="text-sm font-medium">
                {formatDate(fatura.inicio)} a {formatDate(cycle.fim)}
              </p>
              <p className="text-xs text-muted-foreground">
                Fecha em {formatDate(fatura.fechamento)} · vence em{" "}
                {formatDate(fatura.vencimento)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge
                variant={
                  fatura.vencida
                    ? "destructive"
                    : fatura.status === "parcial"
                      ? "warning"
                      : fatura.status === "paga"
                        ? "success"
                        : "secondary"
                }
              >
                {fatura.vencida ? "vencida" : STATUS_LABELS[fatura.status]}
              </Badge>
              {fatura.status === "paga" && fatura.credito > 0 && (
                <Badge variant="success">
                  crédito {formatCurrency(fatura.credito)}
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Metric label="Total" value={formatCurrency(fatura.total)} />
            <Metric label="Pago" value={formatCurrency(fatura.pago)} tone="text-success" />
            <Metric
              label={fatura.credito > 0 ? "Crédito" : "Restante"}
              value={formatCurrency(
                fatura.credito > 0 ? fatura.credito : fatura.restante,
              )}
              tone={fatura.restante > 0 ? "text-destructive" : "text-success"}
            />
          </div>

          <PaymentProgress
            pago={fatura.pago}
            total={fatura.total}
            className="mt-1"
          />

          {canPay ? (
            <p className="flex items-center gap-1.5 rounded-md bg-warning/10 px-2 py-1.5 text-xs text-warning">
              <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
              Fatura {fatura.vencida ? "vencida" : "em aberto"} com{" "}
              {formatCurrency(fatura.restante)} a pagar.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 rounded-md bg-success/10 px-2 py-1.5 text-xs text-success">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Fatura quitada.
            </p>
          )}
        </div>

        {!embedded && (
          <div className="space-y-2 rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Limite usado</span>
            <span className={cn("tabular font-medium", tone.text)}>
              {formatCurrency(detail.limiteUsado)} de{" "}
              {formatCurrency(detail.card.limite)}
            </span>
          </div>
          <BudgetProgress
            gasto={detail.limiteUsado}
            limite={detail.card.limite}
            label={`Limite usado do cartão ${detail.card.nome}`}
          />
          <p className="text-xs text-muted-foreground">
            Disponível:{" "}
            <span
              className={cn(
                "tabular font-medium",
                detail.disponivel < 0 ? "text-destructive" : "text-foreground",
              )}
            >
              {formatCurrency(detail.disponivel)}
            </span>
            {ratio >= 0.8 && (
              <span className={cn("ml-1", tone.text)}>
                · {ratio >= 1 ? "limite estourado" : "acima de 80%"}
              </span>
            )}
          </p>
          {detail.futureInvoices.length > 0 && (
            <div className="border-t border-border pt-2">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                Próximas faturas
              </p>
              <div className="space-y-1">
                {detail.futureInvoices.slice(0, 6).map((invoice) => (
                  <Link
                    key={invoice.chave}
                    href={`/cartoes/${detail.card.id}?fatura=${invoice.chave}`}
                    className="flex items-center justify-between rounded-md px-1 py-1 text-xs hover:bg-accent"
                  >
                    <span>{formatMonthShort(invoice.chave)}</span>
                    <span className="tabular text-muted-foreground">
                      {formatCurrency(invoice.restante)}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Compras da fatura</p>
          <span className="text-xs text-muted-foreground">
            {detail.purchases.length}
          </span>
        </div>

        {detail.purchases.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <ReceiptText className="h-4 w-4" />
            Nenhuma compra nesta fatura.
          </div>
        ) : (
          <div className="divide-y divide-border">
            {groupedPurchases.map(([day, purchases]) => (
              <div key={day}>
                <div className="bg-muted/30 px-4 py-1.5 text-xs font-medium text-muted-foreground">
                  {formatDate(day)}
                </div>
                {purchases.map((purchase) => (
                  <Link
                    key={purchase.id}
                    href={`/lancamentos?mes=${purchase.data.slice(0, 7)}&detalhe=${purchase.id}&dias=31`}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-accent/40"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted">
                      <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {purchase.descricao}
                        </span>
                        {purchase.parcelaAtual && purchase.parcelaTotal && (
                          <Badge variant="secondary" className="px-1.5 py-0 text-xs">
                            {purchase.parcelaAtual}/{purchase.parcelaTotal}
                          </Badge>
                        )}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {purchase.categoriaNome ?? "Outros"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "tabular shrink-0 text-sm font-semibold",
                        purchase.tipo === "receita"
                          ? "text-success"
                          : "text-destructive",
                      )}
                    >
                      {purchase.tipo === "receita" ? "+" : "−"}
                      {formatCurrency(purchase.valor)}
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold">Pagamentos da fatura</p>
        </div>

        {detail.payments.length === 0 ? (
          <p className="px-4 py-5 text-sm text-muted-foreground">
            Nenhum pagamento registrado.
          </p>
        ) : (
          <div className="divide-y divide-border">
            {detail.payments.map((payment) => (
              <div
                key={payment.id}
                className="flex flex-wrap items-center gap-2 px-4 py-2.5"
              >
                <EntityTile
                  kind="conta"
                  entity={{
                    id: payment.contaId,
                    nome: payment.contaNome,
                    cor: payment.contaCor,
                    icone: payment.contaIcone,
                  }}
                  size="xs"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">
                    {payment.contaNome ?? "Conta"} → {detail.card.nome}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(payment.data)}
                    {payment.pago ? "" : " · não pago"}
                  </span>
                </span>
                <Badge variant={payment.pago ? "success" : "warning"}>
                  {payment.pago ? "pago" : "previsto"}
                </Badge>
                <span className="tabular text-sm font-semibold text-destructive">
                  −{formatCurrency(payment.valor)}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-11 sm:h-9"
                  onClick={() => togglePaymentPaid(payment.id, !payment.pago)}
                  disabled={isPending}
                >
                  {payment.pago ? "Reabrir" : "Pagar"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-11 w-11 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label="Desfazer pagamento"
                  title="Desfazer pagamento"
                  onClick={() => undoPayment(payment.id)}
                  disabled={isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
        Compra feita no dia do fechamento entra na fatura seguinte. Parcelas
        futuras já aparecem no limite usado.
      </p>

      <Dialog open={payOpen} onOpenChange={setPayOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar fatura</DialogTitle>
            <DialogDescription>
              {detail.card.nome} · {formatMonthTitle(fatura.chave)} · restante{" "}
              {formatCurrency(fatura.restante)}
            </DialogDescription>
          </DialogHeader>

          <FormError message={error} />

          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Conta</p>
              <NativeSelect
                value={payAccountId}
                onChange={(event) => setPayAccountId(event.target.value)}
              >
                {accounts.map((account) => (
                  <option
                    key={account.id}
                    value={account.id}
                    disabled={account.arquivada && account.id !== payAccountId}
                  >
                    {account.nome}
                    {account.arquivada ? " (arquivada)" : ""}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Valor</p>
              <CurrencyInput value={payValue} onChange={setPayValue} />
              {payValue > fatura.restante && (
                <p className="text-xs text-warning">
                  Acima do restante: {formatCurrency(payValue - fatura.restante)}{" "}
                  ficará como crédito.
                </p>
              )}
            </div>

            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Data</p>
              <DatePicker value={payDate} onChange={setPayDate} />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPayOpen(false)}
              disabled={isPending}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={pay}
              disabled={isPending || !payAccountId || payValue <= 0}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Pagar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {!embedded && formData && (
        <TransactionFormDialog
          open={purchaseOpen}
          onOpenChange={setPurchaseOpen}
          mode="create"
          formData={formData}
          initialCartaoId={detail.card.id}
          onSaved={() => router.refresh()}
        />
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-md border border-border p-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular truncate text-sm font-semibold", tone)}>{value}</p>
    </div>
  );
}
