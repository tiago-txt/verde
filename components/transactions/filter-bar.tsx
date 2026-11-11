"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Search,
  Shapes,
  Tag as TagIcon,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CategoryIcon } from "@/components/category-icon";
import type { TransactionFormData } from "@/lib/db/queries/transactions";
import type { TransactionType } from "@/lib/db/schema";
import {
  countActiveFilters,
  hasActiveFilters,
  type TransactionFilters,
  type TransactionStatusFilter,
} from "@/lib/finance/filters";
import { cn } from "@/lib/utils";

type FilterPatch = Partial<
  Pick<
    TransactionFilters,
    | "tipo"
    | "contas"
    | "cartoes"
    | "categorias"
    | "tags"
    | "status"
    | "q"
    | "comprasCartao"
  >
>;

type FilterBarProps = {
  filters: TransactionFilters;
  options: TransactionFormData;
  onChange: (patch: FilterPatch) => void;
  onClear: () => void;
};

const TYPE_OPTIONS: Array<{ value: TransactionType | null; label: string }> = [
  { value: null, label: "Todos os tipos" },
  { value: "despesa", label: "Despesa" },
  { value: "receita", label: "Receita" },
  { value: "transferencia", label: "Transferência" },
];

const STATUS_OPTIONS: Array<{
  value: TransactionStatusFilter;
  label: string;
}> = [
  { value: "todos", label: "Todos" },
  { value: "pagos", label: "Pagos" },
  { value: "nao_pagos", label: "Não pagos" },
];

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function FilterButton({
  label,
  count,
  icon: Icon,
  children,
  className,
}: {
  label: string;
  count: number;
  icon?: LucideIcon;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 gap-1.5 rounded-full px-3 text-xs",
            count > 0 && "border-primary/40 bg-primary/10 text-primary",
            className,
          )}
        >
          {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
          {label}
          {count > 0 && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}

function ChoiceList<T extends string | null>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex min-h-11 w-full items-center justify-between rounded-md px-2 text-sm",
            value === option.value
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent",
          )}
        >
          {option.label}
          {value === option.value && <Check className="h-4 w-4" />}
        </button>
      ))}
    </div>
  );
}

function AccountFilter({
  accounts,
  selected,
  onChange,
}: {
  accounts: TransactionFormData["accounts"];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {accounts.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          Nenhuma conta cadastrada.
        </p>
      ) : (
        accounts.map((account) => (
          <label
            key={account.id}
            htmlFor={`filter-account-${account.id}`}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
          >
            <Checkbox
              id={`filter-account-${account.id}`}
              checked={selected.includes(account.id)}
              onCheckedChange={() => onChange(toggleId(selected, account.id))}
            />
            <span className="min-w-0 flex-1 truncate">
              {account.nome}
              {account.arquivada ? " (arquivada)" : ""}
            </span>
          </label>
        ))
      )}
    </div>
  );
}

function CardFilter({
  cards,
  selected,
  onChange,
}: {
  cards: TransactionFormData["cards"];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {cards.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          Nenhum cartão cadastrado.
        </p>
      ) : (
        cards.map((card) => (
          <label
            key={card.id}
            htmlFor={`filter-card-${card.id}`}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
          >
            <Checkbox
              id={`filter-card-${card.id}`}
              checked={selected.includes(card.id)}
              onCheckedChange={() => onChange(toggleId(selected, card.id))}
            />
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: card.cor }}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate">
              {card.nome}
              {card.arquivado ? " (arquivado)" : ""}
            </span>
          </label>
        ))
      )}
    </div>
  );
}

function TagFilter({
  tags,
  selected,
  onChange,
}: {
  tags: TransactionFormData["tags"];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="max-h-64 space-y-1 overflow-y-auto">
      {tags.length === 0 ? (
        <p className="px-2 py-3 text-sm text-muted-foreground">
          Nenhuma tag cadastrada.
        </p>
      ) : (
        tags.map((tag) => (
          <label
            key={tag.id}
            htmlFor={`filter-tag-${tag.id}`}
            className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
          >
            <Checkbox
              id={`filter-tag-${tag.id}`}
              checked={selected.includes(tag.id)}
              onCheckedChange={() => onChange(toggleId(selected, tag.id))}
            />
            <span className="min-w-0 flex-1 truncate">{tag.nome}</span>
          </label>
        ))
      )}
    </div>
  );
}

function CategoryFilter({
  categories,
  selected,
  onChange,
  compact = false,
}: {
  categories: TransactionFormData["categories"];
  selected: string[];
  onChange: (ids: string[]) => void;
  compact?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);
  const activeCategories = useMemo(
    () => categories.filter((category) => !category.deletedAt),
    [categories],
  );
  const query = search.trim().toLowerCase();
  const roots = activeCategories.filter(
    (category) => !category.categoriaPaiId,
  );
  const parent = parentId
    ? (activeCategories.find((category) => category.id === parentId) ?? null)
    : null;
  const children = parent
    ? activeCategories.filter(
        (category) => category.categoriaPaiId === parent.id,
      )
    : [];
  const filtered = activeCategories.filter(
    (category) => !query || category.nome.toLowerCase().includes(query),
  );
  const visible = query ? filtered : parent ? children : roots;

  function pick(category: TransactionFormData["categories"][number]) {
    const hasChildren = activeCategories.some(
      (item) => item.categoriaPaiId === category.id,
    );
    if (hasChildren && !query) {
      setParentId(category.id);
      return;
    }
    onChange(toggleId(selected, category.id));
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="relative shrink-0">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar categoria..."
          className="h-11 pl-9"
          aria-label="Buscar categoria no filtro"
        />
      </div>

      {parent && !query && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-label="Voltar para categorias"
            onClick={() => setParentId(null)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-9 min-w-0 flex-1 justify-start gap-2 text-xs"
            onClick={() => onChange(toggleId(selected, parent.id))}
          >
            <CategoryIcon
              icon={parent.icone}
              color={parent.cor}
              className="h-6 w-6"
              iconClassName="h-3 w-3"
            />
            <span className="truncate">
              {selected.includes(parent.id) ? "Remover" : "Usar"} {parent.nome}
            </span>
          </Button>
        </div>
      )}

      <div
        className={cn(
          "grid min-h-0 grid-cols-4 gap-1.5 overflow-y-auto overflow-x-hidden p-0.5 pr-1",
          compact ? "max-h-64" : "max-h-72",
          "sm:grid-cols-6",
        )}
      >
        {visible.length === 0 ? (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            Nenhuma categoria encontrada.
          </p>
        ) : (
          visible.map((category) => {
            const checked = selected.includes(category.id);
            const hasChildren =
              !category.categoriaPaiId &&
              activeCategories.some(
                (item) => item.categoriaPaiId === category.id,
              );
            const parentName = category.categoriaPaiId
              ? (activeCategories.find(
                  (item) => item.id === category.categoriaPaiId,
                )?.nome ?? null)
              : null;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => pick(category)}
                aria-pressed={checked}
                className={cn(
                  "relative flex min-h-[76px] w-full min-w-0 flex-col items-center justify-center gap-1 overflow-hidden rounded-xl border px-1 py-2 text-center transition-colors",
                  checked
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border hover:bg-accent",
                )}
              >
                <CategoryIcon
                  icon={category.icone}
                  color={category.cor}
                  className="h-9 w-9"
                  iconClassName="h-4 w-4"
                />
                <span className="line-clamp-2 w-full break-words text-[10px] leading-tight">
                  {category.nome}
                </span>
                {query && parentName && (
                  <span className="w-full truncate text-[9px] text-muted-foreground">
                    {parentName}
                  </span>
                )}
                {hasChildren && !query && (
                  <ChevronRight
                    className="absolute bottom-1 right-1 h-3 w-3 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                {checked && (
                  <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground">
                    <Check className="h-2.5 w-2.5" />
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function SearchFilter({
  value,
  onChange,
  alwaysOpen = false,
  autoFocus = false,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  alwaysOpen?: boolean;
  autoFocus?: boolean;
}) {
  const [open, setOpen] = useState(alwaysOpen || Boolean(value));
  const [text, setText] = useState(value ?? "");

  useEffect(() => {
    setText(value ?? "");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const trimmed = text.trim();
      if ((value ?? "") !== trimmed) onChange(trimmed || null);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [text, open, value, onChange]);

  if (!open && !alwaysOpen) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="h-11 w-11"
        aria-label="Buscar lançamentos"
        onClick={() => setOpen(true)}
      >
        <Search className="h-4 w-4" />
      </Button>
    );
  }

  return (
    <div className="relative w-full sm:w-64">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Buscar descrição ou observação..."
        className="h-11 pl-9 pr-10"
        autoFocus={autoFocus}
        aria-label="Buscar lançamentos"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !alwaysOpen) setOpen(false);
        }}
      />
      <button
        type="button"
        onClick={() => {
          setText("");
          onChange(null);
          if (!alwaysOpen) setOpen(false);
        }}
        aria-label="Limpar busca"
        className="absolute inset-y-0 right-0 grid h-11 w-11 place-items-center text-muted-foreground hover:text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function CategoryFilterButton({
  categories,
  selected,
  onChange,
}: {
  categories: TransactionFormData["categories"];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "h-10 gap-1.5 rounded-full px-3 text-xs",
            selected.length > 0 &&
              "border-primary/40 bg-primary/10 text-primary",
          )}
        >
          <Shapes className="h-4 w-4" aria-hidden="true" />
          Categorias
          {selected.length > 0 && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px]">
              {selected.length}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[min(92vw,440px)] overflow-hidden p-3"
      >
        <CategoryFilter
          categories={categories}
          selected={selected}
          onChange={onChange}
        />
        <div className="mt-2 flex shrink-0 justify-end border-t border-border pt-2">
          <Button
            type="button"
            size="sm"
            className="h-10 rounded-full px-4"
            onClick={() => setOpen(false)}
          >
            Aplicar
            {selected.length > 0 ? ` (${selected.length})` : ""}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function FilterBar({
  filters,
  options,
  onChange,
  onClear,
  sheetOpen,
  onSheetOpenChange,
  searchFocus = false,
}: FilterBarProps & {
  sheetOpen: boolean;
  onSheetOpenChange: (open: boolean) => void;
  searchFocus?: boolean;
}) {
  const activeCount = countActiveFilters(filters);
  const active = hasActiveFilters(filters);

  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        <SearchFilter value={filters.q} onChange={(q) => onChange({ q })} />

        <FilterButton
          label="Origem"
          icon={Wallet}
          count={filters.contas.length + filters.cartoes.length}
        >
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="px-2 text-[11px] font-medium text-muted-foreground">
                Contas
              </p>
              <AccountFilter
                accounts={options.accounts}
                selected={filters.contas}
                onChange={(contas) => onChange({ contas })}
              />
            </div>
            <div className="space-y-1">
              <p className="px-2 text-[11px] font-medium text-muted-foreground">
                Cartões
              </p>
              <CardFilter
                cards={options.cards}
                selected={filters.cartoes}
                onChange={(cartoes) => onChange({ cartoes })}
              />
            </div>
          </div>
        </FilterButton>

        <FilterButton
          label="Tipo"
          icon={ArrowLeftRight}
          count={filters.tipo ? 1 : 0}
        >
          <ChoiceList
            options={TYPE_OPTIONS}
            value={filters.tipo}
            onChange={(tipo) => onChange({ tipo })}
          />
        </FilterButton>

        <CategoryFilterButton
          categories={options.categories}
          selected={filters.categorias}
          onChange={(categorias) => onChange({ categorias })}
        />

        <FilterButton label="Tags" icon={TagIcon} count={filters.tags.length}>
          <TagFilter
            tags={options.tags}
            selected={filters.tags}
            onChange={(tags) => onChange({ tags })}
          />
        </FilterButton>

        <FilterButton
          label="Status"
          icon={CheckCircle2}
          count={filters.status !== "todos" ? 1 : 0}
        >
          <ChoiceList
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={(status) => onChange({ status })}
          />
        </FilterButton>

        <Button
          type="button"
          variant={filters.comprasCartao ? "default" : "outline"}
          size="icon"
          className="h-10 w-10 rounded-full"
          aria-pressed={filters.comprasCartao}
          aria-label={
            filters.comprasCartao
              ? "Ocultar compras no cartão"
              : "Mostrar compras no cartão"
          }
          title={
            filters.comprasCartao
              ? "Compras no cartão visíveis"
              : "Mostrar compras no cartão"
          }
          onClick={() => onChange({ comprasCartao: !filters.comprasCartao })}
        >
          <CreditCard className="h-4 w-4" />
        </Button>

        {active && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            className="h-10 rounded-full px-3 text-xs"
          >
            <X className="h-4 w-4" />
            Limpar
          </Button>
        )}
      </div>

      <Dialog open={sheetOpen} onOpenChange={onSheetOpenChange}>
        <DialogContent
          className="max-h-[var(--verde-sheet-max-h,92dvh)] overflow-y-auto p-4"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogHeader className="pr-10">
            <DialogTitle>Filtros</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            <SearchFilter
              value={filters.q}
              onChange={(q) => onChange({ q })}
              alwaysOpen
              autoFocus={searchFocus}
            />

            <div className="space-y-2">
              <Label>Origem</Label>
              <p className="text-[11px] font-medium text-muted-foreground">
                Contas
              </p>
              <AccountFilter
                accounts={options.accounts}
                selected={filters.contas}
                onChange={(contas) => onChange({ contas })}
              />
              <p className="pt-1 text-[11px] font-medium text-muted-foreground">
                Cartões
              </p>
              <CardFilter
                cards={options.cards}
                selected={filters.cartoes}
                onChange={(cartoes) => onChange({ cartoes })}
              />
            </div>

            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
              <Checkbox
                checked={filters.comprasCartao}
                onCheckedChange={(checked) =>
                  onChange({ comprasCartao: checked === true })
                }
              />
              Mostrar compras no cartão
            </label>

            <div className="space-y-2">
              <Label>Tipo</Label>
              <ChoiceList
                options={TYPE_OPTIONS}
                value={filters.tipo}
                onChange={(tipo) => onChange({ tipo })}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Categorias</Label>
                {filters.categorias.length > 0 && (
                  <span className="text-[11px] text-muted-foreground">
                    {filters.categorias.length} selecionada(s)
                  </span>
                )}
              </div>
              <CategoryFilter
                categories={options.categories}
                selected={filters.categorias}
                onChange={(categorias) => onChange({ categorias })}
                compact
              />
            </div>

            <div className="space-y-2">
              <Label>Tags</Label>
              <TagFilter
                tags={options.tags}
                selected={filters.tags}
                onChange={(tags) => onChange({ tags })}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <ChoiceList
                options={STATUS_OPTIONS}
                value={filters.status}
                onChange={(status) => onChange({ status })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className="h-12"
              onClick={() => {
                onClear();
                onSheetOpenChange(false);
              }}
            >
              Limpar filtros
            </Button>
            <Button
              type="button"
              className="h-12"
              onClick={() => onSheetOpenChange(false)}
            >
              Aplicar{activeCount > 0 ? ` (${activeCount})` : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
