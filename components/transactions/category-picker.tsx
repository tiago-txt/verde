"use client";

import { useMemo, useState } from "react";
import { Check, CircleEllipsis, Search } from "lucide-react";
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
};

export function CategoryPicker({
  options,
  value,
  onChange,
  disabled,
}: CategoryPickerProps) {
  const [search, setSearch] = useState("");

  const list = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = options.filter((option) =>
      option.nome.toLowerCase().includes(query),
    );

    const roots = filtered.filter((option) => !option.categoriaPaiId);
    const rows = roots.flatMap((root) => [
      root,
      ...filtered.filter((option) => option.categoriaPaiId === root.id),
    ]);

    // Filhos cujo pai não bateu na busca aparecem como itens avulsos.
    const orphans = filtered.filter(
      (option) =>
        option.categoriaPaiId &&
        !filtered.some((parent) => parent.id === option.categoriaPaiId),
    );

    return [...rows, ...orphans];
  }, [options, search]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar categoria..."
          className="pl-9"
          aria-label="Buscar categoria"
          disabled={disabled}
        />
      </div>

      <div className="max-h-48 overflow-y-auto rounded-md border border-border p-1">
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className={cn(
            "flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
            value === null
              ? "bg-primary/10 text-primary"
              : "hover:bg-accent",
          )}
        >
          <span className="grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground">
            <CircleEllipsis className="h-3.5 w-3.5" />
          </span>
          <span className="min-w-0 flex-1 truncate">Outros (padrão)</span>
          {value === null && <Check className="h-4 w-4 shrink-0" />}
        </button>

        {list.length === 0 ? (
          <p className="px-3 py-4 text-sm text-muted-foreground">
            Nenhuma categoria encontrada.
          </p>
        ) : (
          list.map((option) => {
            const selected = value === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange(option.id)}
                disabled={disabled}
                className={cn(
                  "flex min-h-11 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                  option.categoriaPaiId && "pl-6",
                  selected
                    ? "bg-primary/10 text-primary"
                    : "hover:bg-accent",
                )}
              >
                <CategoryIcon
                  icon={option.icone}
                  color={option.cor}
                  className="h-7 w-7"
                  iconClassName="h-3.5 w-3.5"
                />
                <span className="min-w-0 flex-1 truncate">
                  {option.nome}
                  {option.deletedAt ? " (arquivada)" : ""}
                </span>
                {selected && <Check className="h-4 w-4 shrink-0" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
