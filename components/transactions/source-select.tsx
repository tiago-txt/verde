"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { EntityTile } from "@/components/entity-tile";
import type { TransactionFormData } from "@/lib/db/queries/transactions";
import { cn } from "@/lib/utils";

type SourceOption = {
  id: string;
  value: string;
  nome: string;
  detalhe: string;
  cor: string | null;
  icone: "conta" | "cartao";
  iconeNome: string;
  arquivado: boolean;
};

type SourceSelectProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  accounts: TransactionFormData["accounts"];
  cards: TransactionFormData["cards"];
  /** Apenas contas (ex.: origem/destino de transferência). */
  accountsOnly?: boolean;
  /** Conta que não deve aparecer (destino de transferência). */
  excludeAccountId?: string | null;
  placeholder?: string;
  title?: string;
  emptyLabel?: string;
  "aria-invalid"?: boolean;
  className?: string;
  /** Linha compacta de 56px no mobile. */
  rowMode?: { icon: LucideIcon; label: string };
};

export function SourceSelect({
  id,
  value,
  onChange,
  accounts,
  cards,
  accountsOnly = false,
  excludeAccountId = null,
  placeholder = "Selecione",
  title = "Conta ou cartão",
  emptyLabel = "Nenhuma conta ou cartão",
  className,
  rowMode,
  ...rest
}: SourceSelectProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);

  const options = useMemo<SourceOption[]>(() => {
    const accountOptions = accounts
      .filter((account) => account.id !== excludeAccountId)
      .map<SourceOption>((account) => ({
        id: account.id,
        value: `conta:${account.id}`,
        nome: account.nome,
        detalhe: account.arquivada ? "Conta arquivada" : "Conta",
        cor: account.cor,
        icone: "conta",
        iconeNome: account.icone,
        arquivado: account.arquivada,
      }));

    if (accountsOnly) return accountOptions;

    const cardOptions = cards.map<SourceOption>((card) => ({
      id: card.id,
      value: `cartao:${card.id}`,
      nome: card.nome,
      detalhe: card.arquivado
        ? "Cartão arquivado"
        : `${card.bandeira} · fecha dia ${card.diaFechamento}`,
      cor: card.cor,
      icone: "cartao",
      iconeNome: card.icone,
      arquivado: card.arquivado,
    }));

    return [...accountOptions, ...cardOptions];
  }, [accounts, accountsOnly, cards, excludeAccountId]);

  const selected = options.find((option) => option.value === value) ?? null;

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  const groups = [
    {
      key: "conta",
      label: "Contas",
      items: options.filter((option) => option.icone === "conta"),
    },
    {
      key: "cartao",
      label: "Cartões",
      items: options.filter((option) => option.icone === "cartao"),
    },
  ].filter((group) => group.items.length > 0);

  const list = (
    <div className="space-y-4">
      {groups.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      )}
      {groups.map((group) => (
        <div key={group.key} className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
          </p>
          <div
            className={cn(
              "grid gap-2",
              isMobile ? "grid-cols-1" : "grid-cols-2",
            )}
          >
            {group.items.map((option) => {
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => pick(option.value)}
                  disabled={option.arquivado && !active}
                  className={cn(
                    "relative flex min-h-[68px] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors",
                    active
                      ? "border-primary/50 bg-primary/10"
                      : "border-border hover:bg-accent",
                    option.arquivado && !active && "opacity-50",
                  )}
                >
                  <EntityTile
                    kind={option.icone}
                    entity={{
                      id: option.id,
                      nome: option.nome,
                      cor: option.cor,
                      icone: option.iconeNome,
                    }}
                    size="sm"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">
                      {option.nome}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {option.detalhe}
                    </span>
                  </span>
                  {active && (
                    <Check className="h-4 w-4 shrink-0 text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );

  const trigger = (
    <button
      id={id}
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-invalid={rest["aria-invalid"]}
      className={cn(
        "flex h-12 w-full items-center gap-2 rounded-xl border border-input bg-background px-2.5 text-left text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-11",
        className,
      )}
    >
      {selected ? (
        <EntityTile
          kind={selected.icone}
          entity={{
            id: selected.id,
            nome: selected.nome,
            cor: selected.cor,
            icone: selected.iconeNome,
          }}
          size="xs"
        />
      ) : (
        <EntityTile kind="conta" size="xs" />
      )}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block truncate font-medium",
            !selected && "text-muted-foreground",
          )}
        >
          {selected?.nome ?? placeholder}
        </span>
        {selected && (
          <span className="block truncate text-xs text-muted-foreground">
            {selected.detalhe}
          </span>
        )}
      </span>
      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );

  const rowTrigger = rowMode ? (
    <button
      id={id}
      type="button"
      onClick={() => setOpen(true)}
      aria-haspopup="dialog"
      aria-invalid={rest["aria-invalid"]}
      className="flex min-h-14 w-full items-center gap-3 py-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <rowMode.icon
        className="h-5 w-5 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
      <span className="min-w-0 flex-1">
        <span className="block text-xs text-muted-foreground">
          {rowMode.label}
        </span>
        <span className="mt-0.5 flex min-w-0 items-center gap-2">
          {selected ? (
            <EntityTile
              kind={selected.icone}
              entity={{
                id: selected.id,
                nome: selected.nome,
                cor: selected.cor,
                icone: selected.iconeNome,
              }}
              size="xs"
            />
          ) : (
            <EntityTile kind="conta" size="xs" />
          )}
          <span
            className={cn(
              "truncate text-base font-medium",
              !selected && "text-muted-foreground",
            )}
          >
            {selected?.nome ?? placeholder}
          </span>
        </span>
      </span>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </button>
  ) : null;

  if (isMobile) {
    return (
      <>
        {rowMode ? rowTrigger : trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            className="max-h-[min(85dvh,var(--verde-sheet-max-h,85dvh))] overflow-hidden p-0"
            onOpenAutoFocus={(event) => event.preventDefault()}
          >
            <DialogHeader className="shrink-0 border-b border-border px-4 py-3 pr-10">
              <DialogTitle>{title}</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{list}</div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-3">
        {list}
      </PopoverContent>
    </Popover>
  );
}
