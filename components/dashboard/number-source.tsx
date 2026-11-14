"use client";

import { Info } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

export type NumberSourceItem = {
  label: string;
  value: number;
  href?: string;
  hint?: string;
};

/**
 * "De onde vem este número": abre a fórmula, os componentes e os links que
 * fecham exatamente com o valor exibido no card.
 */
export function NumberSource({
  title,
  description,
  total,
  items,
  formula,
  note,
  triggerLabel = "De onde vem este número",
  triggerClassName,
}: {
  title: string;
  description?: string;
  total: number;
  items: NumberSourceItem[];
  formula?: string;
  note?: string;
  triggerLabel?: string;
  triggerClassName?: string;
}) {
  const sum = items.reduce((accumulator, item) => accumulator + item.value, 0);
  const closes = Math.abs(sum - total) < 1;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "h-11 gap-1.5 px-2 text-xs text-muted-foreground max-sm:min-h-12 sm:h-8",
            triggerClassName,
          )}
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="space-y-1">
          {items.map((item) => {
            const content = (
              <>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.label}</span>
                  {item.hint && (
                    <span className="text-xs text-muted-foreground">
                      {item.hint}
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "tabular shrink-0 font-semibold",
                    item.value < 0 && "text-clay",
                  )}
                >
                  {formatCurrency(item.value)}
                </span>
              </>
            );
            return item.href ? (
              <Link
                key={item.label}
                href={item.href}
                className="flex min-h-12 items-center justify-between gap-4 rounded-lg px-2 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {content}
              </Link>
            ) : (
              <div
                key={item.label}
                className="flex min-h-10 items-center justify-between gap-4 px-2 text-sm"
              >
                {content}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
          <span className="text-sm font-medium">Total</span>
          <span className="tabular text-base font-bold">
            {formatCurrency(total)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {formula ? `${formula} ` : ""}
          {closes
            ? `A soma dos componentes fecha com o valor exibido (${formatCurrency(total)}).`
            : `A soma dos componentes é ${formatCurrency(sum)} e o valor exibido é ${formatCurrency(total)}.`}
        </p>
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
      </DialogContent>
    </Dialog>
  );
}
