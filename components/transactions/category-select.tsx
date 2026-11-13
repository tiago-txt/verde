"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleEllipsis,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CategoryIcon } from "@/components/category-icon";
import { EntityTile } from "@/components/entity-tile";
import {
  CategoryPicker,
  type CategoryOption,
} from "./category-picker";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { cn } from "@/lib/utils";

type CategorySelectProps = {
  id?: string;
  options: CategoryOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  /** Linha compacta de 56px no mobile. */
  rowMode?: { icon: LucideIcon; label: string };
};

/**
 * Campo compacto de categoria: ocupa uma linha no formulário e abre a busca
 * existente em popover (desktop) ou bottom sheet (mobile).
 */
export function CategorySelect({
  id,
  options,
  value,
  onChange,
  disabled,
  className,
  rowMode,
}: CategorySelectProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.id === value) ?? null;

  const trigger = (
    <button
      type="button"
      id={id}
      onClick={() => setOpen((current) => !current)}
      disabled={disabled}
      aria-haspopup="listbox"
      aria-expanded={open}
      className={cn(
        "flex h-12 w-full items-center justify-between gap-2 rounded-xl border border-input bg-background px-3 text-sm shadow-sm transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 sm:h-11",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {selected ? (
          <CategoryIcon
            id={selected.id}
            icon={selected.icone}
            color={selected.cor}
            className="h-6 w-6"
            iconClassName="h-3.5 w-3.5"
          />
        ) : (
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
            <CircleEllipsis className="h-3.5 w-3.5" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-left">
          {selected?.nome ?? "Outros (padrão)"}
          {selected?.deletedAt ? " (arquivada)" : ""}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </span>
    </button>
  );

  const panel = (
    <CategoryPicker
      options={options}
      value={value}
      autoFocusSearch={!isMobile}
      onChange={(next) => {
        onChange(next);
        setOpen(false);
      }}
      disabled={disabled}
    />
  );

  const rowTrigger = rowMode ? (
    <button
      type="button"
      id={id}
      onClick={() => setOpen(true)}
      disabled={disabled}
      aria-haspopup="dialog"
      className="flex min-h-14 w-full items-center gap-3 py-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
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
          <EntityTile
            kind="categoria"
            entity={
              selected
                ? {
                    id: selected.id,
                    nome: selected.nome,
                    icone: selected.icone,
                    cor: selected.cor,
                  }
                : { nome: "Outros" }
            }
            size="xs"
          />
          <span className="truncate text-base font-medium">
            {selected?.nome ?? "Outros (padrão)"}
            {selected?.deletedAt ? " (arquivada)" : ""}
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
              <DialogTitle>Categoria</DialogTitle>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">{panel}</div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-[min(92vw,460px)] overflow-hidden p-3"
      >
        {panel}
      </PopoverContent>
    </Popover>
  );
}
