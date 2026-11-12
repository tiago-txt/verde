"use client";

import { useMemo, useState } from "react";
import { Check, ChevronLeft, CircleEllipsis, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/utils";

export type CategoryOption = {
  id: string;
  nome: string;
  tipo: "despesa" | "receita";
  icone: string;
  cor: string;
  categoriaPaiId: string | null;
  deletedAt: Date | null;
};

type CategoryPickerProps = {
  options: CategoryOption[];
  value: string | null;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  autoFocusSearch?: boolean;
};

export function CategoryPicker({
  options,
  value,
  onChange,
  disabled,
  autoFocusSearch = false,
}: CategoryPickerProps) {
  const [search, setSearch] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);

  const query = search.trim().toLowerCase();
  const filtered = options.filter((option) =>
    option.nome.toLowerCase().includes(query),
  );
  const roots = filtered.filter((option) => !option.categoriaPaiId);
  const parent = parentId
    ? options.find((option) => option.id === parentId) ?? null
    : null;
  const children = parent
    ? filtered.filter((option) => option.categoriaPaiId === parent.id)
    : [];

  const visible = useMemo(() => {
    if (query) {
      return filtered;
    }
    if (parent) return children;
    return roots;
  }, [children, filtered, parent, query, roots]);

  function pick(option: CategoryOption | null) {
    if (!option) {
      onChange(null);
      return;
    }
    const hasChildren = options.some(
      (item) => item.categoriaPaiId === option.id,
    );
    if (hasChildren && !query) {
      setParentId(option.id);
      return;
    }
    onChange(option.id);
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar categoria..."
          className="h-11 pl-9"
          aria-label="Buscar categoria"
          disabled={disabled}
          autoFocus={autoFocusSearch}
        />
      </div>

      {parent && !query && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setParentId(null)}
            className="grid h-11 w-11 place-items-center rounded-xl bg-muted text-muted-foreground hover:bg-accent"
            aria-label="Voltar para categorias"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onChange(parent.id)}
            className="flex h-11 flex-1 items-center gap-2 rounded-xl border border-border px-3 text-sm hover:bg-accent"
          >
            <CategoryIcon
              icon={parent.icone}
              color={parent.cor}
              className="h-7 w-7"
              iconClassName="h-3.5 w-3.5"
            />
            <span className="truncate">Usar {parent.nome}</span>
          </button>
        </div>
      )}

      <div className="grid max-h-72 grid-cols-4 gap-2 overflow-y-auto overflow-x-hidden p-0.5 sm:grid-cols-5">
        {!parent && !query && (
          <button
            type="button"
            onClick={() => pick(null)}
            disabled={disabled}
            className={cn(
              "relative flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors",
              value === null
                ? "border-primary/50 bg-primary/10 text-primary"
                : "border-border hover:border-primary/40 hover:bg-accent",
            )}
          >
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-muted-foreground">
              <CircleEllipsis className="h-4 w-4" />
            </span>
            <span className="line-clamp-2 w-full break-words text-xs leading-tight">
              Outros (padrão)
            </span>
            {value === null && (
              <Check className="absolute right-1 top-1 h-3.5 w-3.5" />
            )}
          </button>
        )}

        {visible.map((option) => {
          const selected = value === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => pick(option)}
              disabled={disabled}
              className={cn(
                "relative flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center transition-colors",
                selected
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border hover:border-primary/40 hover:bg-accent",
              )}
            >
              <CategoryIcon
                icon={option.icone}
                color={option.cor}
                className="h-9 w-9"
                iconClassName="h-4 w-4"
              />
              <span className="line-clamp-2 w-full break-words text-xs leading-tight">
                {option.nome}
              </span>
              {selected && (
                <Check className="absolute right-1 top-1 h-3.5 w-3.5" />
              )}
            </button>
          );
        })}

        {visible.length === 0 && !(!parent && !query) && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            Nenhuma categoria encontrada.
          </p>
        )}
      </div>
    </div>
  );
}
