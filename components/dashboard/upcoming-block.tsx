"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import Link from "next/link";
import { CalendarClock, Check, CreditCard, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { setTransactionPaidAction } from "@/lib/actions/transactions";
import type { UpcomingExpense } from "@/lib/db/queries/reports";
import { formatCurrency, formatDate } from "@/lib/format";

type UpcomingInvoice = {
  id: string;
  cartaoId: string;
  cartaoNome: string;
  cartaoCor: string;
  faturaChave: string;
  vencimento: string;
  restante: number;
  dueInDays: number;
};

type UpcomingBlockProps = {
  expenses: UpcomingExpense[];
  invoices: UpcomingInvoice[];
};

export function UpcomingBlock({ expenses, invoices }: UpcomingBlockProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  const items = [
    ...expenses.map((expense) => ({
      kind: "expense" as const,
      date: expense.data,
      dueInDays: expense.daysUntil,
      data: expense,
    })),
    ...invoices.map((invoice) => ({
      kind: "invoice" as const,
      date: invoice.vencimento,
      dueInDays: invoice.dueInDays,
      data: invoice,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  function markPaid(id: string) {
    startTransition(async () => {
      const result = await setTransactionPaidAction({ id, pago: true });
      if (!result.ok) {
        toast({ description: result.error, tone: "error" });
        return;
      }
      toast({ description: "Conta marcada como paga.", tone: "success" });
      router.refresh();
    });
  }

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-grout bg-forest-container/50 p-3 text-sm text-muted-foreground">
        <span className="tile grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-grout bg-forest-high text-primary">
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
        <span>
          <span className="block font-medium text-on-surface">Tudo em dia</span>
          Nada a vencer nos próximos 15 dias.
        </span>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li
          key={`${item.kind}-${item.data.id}`}
          className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-center"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted">
              {item.kind === "invoice" ? (
                <CreditCard className="h-4 w-4" aria-hidden="true" />
              ) : (
                <CalendarClock className="h-4 w-4" aria-hidden="true" />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {item.kind === "invoice"
                  ? `Fatura ${item.data.cartaoNome}`
                  : item.data.descricao}
              </span>
              <span className="block text-xs text-muted-foreground">
                {formatDate(item.date)} ·{" "}
                {item.dueInDays === 0
                  ? "vence hoje"
                  : `vence em ${item.dueInDays} dia(s)`}
                {item.kind === "expense" && item.data.categoriaNome
                  ? ` · ${item.data.categoriaNome}`
                  : ""}
                {item.kind === "expense" && item.data.contaNome
                  ? ` · ${item.data.contaNome}`
                  : ""}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-end gap-2">
            <span className="tabular shrink-0 text-sm font-semibold text-destructive">
              {formatCurrency(
                item.kind === "invoice" ? item.data.restante : item.data.valor,
              )}
            </span>

            {item.kind === "invoice" ? (
              <Button asChild variant="outline" size="sm" className="h-11 sm:h-9">
                <Link
                  href={`/cartoes/${item.data.cartaoId}?fatura=${item.data.faturaChave}`}
                >
                  Pagar fatura
                </Link>
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-11 sm:h-9"
                onClick={() => markPaid(item.data.id)}
                disabled={isPending}
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Marcar pago
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
