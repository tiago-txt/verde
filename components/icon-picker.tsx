"use client";

import { ICON_MAP } from "@/lib/icons";
import { ICON_NAMES } from "@/lib/icon-names";
import { cn } from "@/lib/utils";

type IconPickerProps = {
  value: string;
  onChange: (icon: string) => void;
  disabled?: boolean;
};

export function IconPicker({ value, onChange, disabled }: IconPickerProps) {
  return (
    <div
      className="grid max-h-48 grid-cols-8 gap-1 overflow-y-auto rounded-md border border-border p-2"
      role="group"
      aria-label="Ícone"
    >
      {ICON_NAMES.map((name) => {
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
              "grid h-10 w-10 place-items-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              selected
                ? "bg-primary/15 text-primary ring-1 ring-primary/40"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
