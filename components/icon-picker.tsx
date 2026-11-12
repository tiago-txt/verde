"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { EntityTile } from "@/components/entity-tile";
import { Input } from "@/components/ui/input";
import { ICON_MAP } from "@/lib/icons";
import { ICON_NAMES } from "@/lib/icon-names";
import {
  filterBankIcons,
  type BankIconDefinition,
} from "@/lib/finance/bank-icons";
import { cn } from "@/lib/utils";

type IconTab = "banks" | "custom";

type IconPickerProps = {
  value: string;
  onChange: (icon: string, bank?: BankIconDefinition) => void;
  disabled?: boolean;
  defaultTab?: IconTab;
  kind?: "conta" | "cartao";
  /** Contas e cartões aceitam `bank:*`; categorias e orçamentos não. */
  allowBanks?: boolean;
};

export function IconPicker({
  value,
  onChange,
  disabled,
  defaultTab,
  kind = "conta",
  allowBanks = false,
}: IconPickerProps) {
  const [tab, setTab] = useState<IconTab>(() => {
    if (!allowBanks) return "custom";
    if (value.startsWith("bank:")) return "banks";
    return defaultTab ?? "custom";
  });
  const [query, setQuery] = useState("");

  const activeTab: IconTab = allowBanks ? tab : "custom";
  const banks = filterBankIcons(query);
  const custom = ICON_NAMES.filter((name) =>
    name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {allowBanks && (
        <div className="flex rounded-lg border border-grout bg-surface-lowest p-1">
          {(
            [
              { value: "banks", label: "Instituições financeiras" },
              { value: "custom", label: "Ícones personalizados" },
            ] as const
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTab(option.value)}
              aria-pressed={activeTab === option.value}
              className={cn(
                "min-h-10 flex-1 rounded-md px-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                activeTab === option.value
                  ? "bg-primary-fill text-primary-fill-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-forest-high hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            activeTab === "banks"
              ? "Pesquisar banco ou apelido (nu, bb, cef…)"
              : "Pesquisar ícone"
          }
          className="h-11 pl-9"
          aria-label="Pesquisar ícones"
          disabled={disabled}
        />
      </div>

      {activeTab === "banks" ? (
        <div
          className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto rounded-lg border border-grout bg-surface-low p-2 sm:grid-cols-4"
          role="group"
          aria-label="Instituições financeiras"
        >
          {banks.length === 0 ? (
            <p className="col-span-full px-2 py-4 text-center text-xs text-muted-foreground">
              Nenhuma instituição encontrada.
            </p>
          ) : (
            banks.map((bank) => {
              const selected = value === bank.id;
              return (
                <button
                  key={bank.id}
                  type="button"
                  onClick={() => onChange(bank.id, bank)}
                  disabled={disabled}
                  aria-label={bank.name}
                  aria-pressed={selected}
                  title={bank.name}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary/50 bg-primary/10 ring-1 ring-primary/30"
                      : "border-grout bg-surface-lowest hover:bg-forest-high",
                  )}
                >
                  <EntityTile
                    kind={kind}
                    entity={{ icone: bank.id, cor: bank.brandColor }}
                    size="sm"
                  />
                  <span className="line-clamp-2 text-xs font-medium leading-tight">
                    {bank.name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      ) : (
        <div
          className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto rounded-lg border border-grout bg-surface-low p-2 sm:grid-cols-6"
          role="group"
          aria-label="Ícones personalizados"
        >
          {custom.length === 0 ? (
            <p className="col-span-full px-2 py-4 text-center text-xs text-muted-foreground">
              Nenhum ícone encontrado.
            </p>
          ) : (
            custom.map((name) => {
              const Icon = ICON_MAP[name];
              const selected = value === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => onChange(name)}
                  disabled={disabled}
                  aria-label={name}
                  aria-pressed={selected}
                  title={name}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-lg border px-1 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected
                      ? "border-primary/50 bg-primary/10 text-primary ring-1 ring-primary/30"
                      : "border-grout bg-surface-lowest text-muted-foreground hover:bg-forest-high hover:text-foreground",
                  )}
                >
                  <Icon className="h-6 w-6" aria-hidden="true" />
                  <span className="line-clamp-1 text-xs font-medium leading-tight">
                    {name}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
