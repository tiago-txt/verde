"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Filter, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DatePicker } from "@/components/calendar/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CategoryIcon } from "@/components/category-icon";
import { EntityTile } from "@/components/entity-tile";
import type { CardOption } from "@/lib/db/queries/cards";
import type { ReportFilters } from "@/lib/finance/report-filters";
import {
  buildReportSearchParams,
  type ReportType,
} from "@/lib/finance/report-filters";
import { reportPeriodRange, type ReportPeriod } from "@/lib/finance/reports";
import { cn } from "@/lib/utils";

type AccountOption = {
  id: string;
  nome: string;
  arquivada: boolean;
  cor: string;
  icone: string;
};
type CategoryOption = {
  id: string;
  nome: string;
  tipo: "despesa" | "receita";
  icone: string;
  cor: string;
  categoriaPaiId: string | null;
  deletedAt: Date | null;
};

type ReportFiltersBarProps = {
  filters: ReportFilters;
  accounts: AccountOption[];
  cards: CardOption[];
  categories: CategoryOption[];
  tags: { id: string; nome: string }[];
};

const PERIOD_OPTIONS: { value: ReportPeriod; label: string }[] = [
  { value: "mes", label: "Mês atual" },
  { value: "mes-anterior", label: "Mês anterior" },
  { value: "3m", label: "Últimos 3 meses" },
  { value: "6m", label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
  { value: "ano", label: "Ano atual" },
  { value: "personalizado", label: "Intervalo personalizado" },
];

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

function MultiPopover({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-11 gap-2">
          {label}
          {count > 0 && (
            <Badge variant="default" className="px-1.5 py-0 text-xs">
              {count}
            </Badge>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        {children}
      </PopoverContent>
    </Popover>
  );
}

export function ReportFiltersBar({
  filters,
  accounts,
  cards,
  categories,
  tags,
}: ReportFiltersBarProps) {
  const router = useRouter();
  const [categorySearch, setCategorySearch] = useState("");
  const [de, setDe] = useState(filters.range.from);
  const [ate, setAte] = useState(filters.range.to);

  const activeCategories = useMemo(
    () => categories.filter((category) => !category.deletedAt),
    [categories],
  );
  const query = categorySearch.trim().toLowerCase();
  const filteredCategories = activeCategories.filter(
    (category) => !query || category.nome.toLowerCase().includes(query),
  );

  function navigate(next: ReportFilters) {
    const range = reportPeriodRange(next.periodo, next.mes, {
      from: next.de,
      to: next.ate,
    });
    const params = buildReportSearchParams({ ...next, range });
    router.push(`/relatorios?${params.toString()}`);
  }

  function patch(partial: Partial<ReportFilters>) {
    const next = { ...filters, ...partial };
    if (next.periodo !== "personalizado") {
      next.de = null;
      next.ate = null;
    }
    navigate(next);
  }

  function setPeriod(periodo: ReportPeriod) {
    if (periodo === "personalizado") {
      const range = reportPeriodRange("personalizado", filters.mes, {
        from: filters.range.from,
        to: filters.range.to,
      });
      setDe(range.from);
      setAte(range.to);
      patch({
        periodo,
        de: range.from,
        ate: range.to,
      });
      return;
    }
    patch({ periodo });
  }

  function applyCustom(nextDe: string, nextAte: string) {
    if (!nextDe || !nextAte || nextDe > nextAte) return;
    setDe(nextDe);
    setAte(nextAte);
    patch({ periodo: "personalizado", de: nextDe, ate: nextAte });
  }

  const originCount = filters.contas.length + filters.cartoes.length;

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor="report-period" className="text-xs text-muted-foreground">
            Período
          </Label>
          <NativeSelect
            id="report-period"
            value={filters.periodo}
            onChange={(event) => setPeriod(event.target.value as ReportPeriod)}
            className="min-w-[170px]"
          >
            {PERIOD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="space-y-1">
          <span className="block text-xs text-muted-foreground">Tipo</span>
          <div className="flex h-11 items-center gap-1 rounded-md bg-muted p-1">
            {(["despesa", "receita"] as ReportType[]).map((tipo) => (
              <button
                key={tipo}
                type="button"
                onClick={() => patch({ tipo })}
                aria-pressed={filters.tipo === tipo}
                className={cn(
                  "h-9 rounded px-3 text-xs font-medium transition-colors max-sm:min-h-12",
                  filters.tipo === tipo
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tipo === "despesa" ? "Despesas" : "Receitas"}
              </button>
            ))}
          </div>
        </div>

        <MultiPopover label="Origem" count={originCount}>
          <div className="max-h-72 space-y-3 overflow-y-auto">
            <div>
              <p className="px-2 text-xs font-medium text-muted-foreground">
                Contas
              </p>
              {accounts.map((account) => (
                <label
                  key={account.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={filters.contas.includes(account.id)}
                    onCheckedChange={() =>
                      patch({ contas: toggleId(filters.contas, account.id) })
                    }
                  />
                  <EntityTile
                    kind="conta"
                    entity={{
                      id: account.id,
                      nome: account.nome,
                      cor: account.cor,
                      icone: account.icone,
                    }}
                    size="xs"
                  />
                  <span className="truncate">{account.nome}</span>
                </label>
              ))}
            </div>
            <div>
              <p className="px-2 text-xs font-medium text-muted-foreground">
                Cartões
              </p>
              {cards.map((card) => (
                <label
                  key={card.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={filters.cartoes.includes(card.id)}
                    onCheckedChange={() =>
                      patch({ cartoes: toggleId(filters.cartoes, card.id) })
                    }
                  />
                  <EntityTile
                    kind="cartao"
                    entity={{
                      id: card.id,
                      nome: card.nome,
                      cor: card.cor,
                      icone: card.icone,
                    }}
                    size="xs"
                  />
                  <span className="truncate">{card.nome}</span>
                </label>
              ))}
            </div>
          </div>
        </MultiPopover>

        <MultiPopover label="Categorias" count={filters.categorias.length}>
          <div className="space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={categorySearch}
                onChange={(event) => setCategorySearch(event.target.value)}
                placeholder="Buscar categoria..."
                className="h-10 pl-9"
                aria-label="Buscar categoria no relatório"
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {filteredCategories.map((category) => (
                <label
                  key={category.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
                >
                  <Checkbox
                    checked={filters.categorias.includes(category.id)}
                    onCheckedChange={() =>
                      patch({
                        categorias: toggleId(filters.categorias, category.id),
                      })
                    }
                  />
                  <CategoryIcon
                    id={category.id}
                    icon={category.icone}
                    color={category.cor}
                    className="h-6 w-6"
                    iconClassName="h-3 w-3"
                  />
                  <span className="truncate">{category.nome}</span>
                </label>
              ))}
            </div>
          </div>
        </MultiPopover>

        <MultiPopover label="Tags" count={filters.tags.length}>
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {tags.map((tag) => (
              <label
                key={tag.id}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-accent"
              >
                <Checkbox
                  checked={filters.tags.includes(tag.id)}
                  onCheckedChange={() =>
                    patch({ tags: toggleId(filters.tags, tag.id) })
                  }
                />
                <span className="truncate">{tag.nome}</span>
              </label>
            ))}
          </div>
        </MultiPopover>

        <div className="flex h-11 items-center gap-1 rounded-md bg-muted p-1">
          {[
            { value: false, label: "Todos lançados" },
            { value: true, label: "Somente pagos" },
          ].map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => patch({ onlyPaid: option.value })}
              aria-pressed={filters.onlyPaid === option.value}
              className={cn(
                "h-9 rounded px-2.5 text-xs font-medium transition-colors max-sm:min-h-12",
                filters.onlyPaid === option.value
                  ? "bg-card text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {filters.periodo === "personalizado" && (
        <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">De</span>
            <DatePicker
              value={de}
              onChange={(value) => applyCustom(value, ate)}
              className="w-40"
            />
          </div>
          <div className="space-y-1">
            <span className="block text-xs text-muted-foreground">Até</span>
            <DatePicker
              value={ate}
              onChange={(value) => applyCustom(de, value)}
              className="w-40"
            />
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            <Filter className="mr-1 inline h-3 w-3" aria-hidden="true" />
            O período anterior equivalente é usado na comparação.
          </p>
        </div>
      )}
    </div>
  );
}
