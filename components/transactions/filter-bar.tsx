"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  Search,
  SlidersHorizontal,
  X,
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
  children,
  className,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("h-11 gap-2", className)}
        >
          {label}
          {count > 0 && (
            <Badge variant="default" className="px-1.5 py-0 text-[10px]">
              {count}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
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
  const activeCategories = useMemo(
    () => categories.filter((category) => !category.deletedAt),
    [categories],
  );
  const query = search.trim().toLowerCase();
  const matches = (name: string) =>
    !query || name.toLowerCase().includes(query);
  const roots = activeCategories.filter(
    (category) =>
      !category.categoriaPaiId &&
      (matches(category.nome) ||
        activeCategories.some(
          (child) =>
            child.categoriaPaiId === category.id && matches(child.nome),
        )),
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar categoria..."
          className="h-11 pl-9"
          aria-label="Buscar categoria no filtro"
        />
      </div>

      <div
        className={cn(
          "space-y-1 overflow-y-auto",
          compact ? "max-h-56" : "max-h-64",
        )}
      >
        {roots.length === 0 ? (
          <p className="px-2 py-3 text-sm text-muted-foreground">
            Nenhuma categoria encontrada.
          </p>
        ) : (
          roots.map((root) => {
            const children = activeCategories.filter(
              (category) =>
                category.categoriaPaiId === root.id &&
                (matches(root.nome) || matches(category.nome)),
            );
            return (
              <div key={root.id}>
                <label
                  htmlFor={`filter-category-${root.id}`}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
                >
                  <Checkbox
                    id={`filter-category-${root.id}`}
                    checked={selected.includes(root.id)}
                    onCheckedChange={() =>
                      onChange(toggleId(selected, root.id))
                    }
                  />
                  <CategoryIcon
                    icon={root.icone}
                    color={root.cor}
                    className="h-6 w-6"
                    iconClassName="h-3 w-3"
                  />
                  <span className="min-w-0 flex-1 truncate">{root.nome}</span>
                </label>
                {children.length > 0 && (
                  <div className="ml-6 border-l border-border/70 pl-1">
                    {children.map((child) => (
                      <label
                        key={child.id}
                        htmlFor={`filter-category-${child.id}`}
                        className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
                      >
                        <Checkbox
                          id={`filter-category-${child.id}`}
                          checked={selected.includes(child.id)}
                          onCheckedChange={() =>
                            onChange(toggleId(selected, child.id))
                          }
                        />
                        <CategoryIcon
                          icon={child.icone}
                          color={child.cor}
                          className="h-6 w-6"
                          iconClassName="h-3 w-3"
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {child.nome}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
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

export function FilterBar({
  filters,
  options,
  onChange,
  onClear,
}: FilterBarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchFocus, setSearchFocus] = useState(false);
  const activeCount = countActiveFilters(filters);
  const active = hasActiveFilters(filters);

  return (
    <>
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <SearchFilter value={filters.q} onChange={(q) => onChange({ q })} />

        <FilterButton
          label="Origem"
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

        <FilterButton label="Tipo" count={filters.tipo ? 1 : 0}>
          <ChoiceList
            options={TYPE_OPTIONS}
            value={filters.tipo}
            onChange={(tipo) => onChange({ tipo })}
          />
        </FilterButton>

        <FilterButton
          label="Categorias"
          count={filters.categorias.length}
        >
          <CategoryFilter
            categories={options.categories}
            selected={filters.categorias}
            onChange={(categorias) => onChange({ categorias })}
          />
        </FilterButton>

        <FilterButton label="Tags" count={filters.tags.length}>
          <TagFilter
            tags={options.tags}
            selected={filters.tags}
            onChange={(tags) => onChange({ tags })}
          />
        </FilterButton>

        <FilterButton
          label="Status"
          count={filters.status !== "todos" ? 1 : 0}
        >
          <ChoiceList
            options={STATUS_OPTIONS}
            value={filters.status}
            onChange={(status) => onChange({ status })}
          />
        </FilterButton>

        {active && (
          <Button
            type="button"
            variant="ghost"
            onClick={onClear}
            className="h-11"
          >
            <X className="h-4 w-4" />
            Limpar filtros
          </Button>
        )}

        <label className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 text-sm">
          <Checkbox
            checked={filters.comprasCartao}
            onCheckedChange={(checked) =>
              onChange({ comprasCartao: checked === true })
            }
          />
          Mostrar compras no cartão
        </label>
      </div>

      <div className="flex items-center gap-2 sm:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-11 w-11"
          aria-label="Buscar lançamentos"
          onClick={() => {
            setSearchFocus(true);
            setSheetOpen(true);
          }}
        >
          <Search className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-11 flex-1 justify-between"
          onClick={() => {
            setSearchFocus(false);
            setSheetOpen(true);
          }}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4" />
            Filtros
            {activeCount > 0 && (
              <Badge variant="default" className="px-1.5 py-0 text-[10px]">
                {activeCount}
              </Badge>
            )}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
        {active && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-11 w-11"
            aria-label="Limpar filtros"
            onClick={onClear}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto p-5 sm:max-w-lg">
          <DialogHeader>
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
              <Label>Categorias</Label>
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
              onClick={() => {
                onClear();
                setSheetOpen(false);
              }}
            >
              Limpar filtros
            </Button>
            <Button type="button" onClick={() => setSheetOpen(false)}>
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
