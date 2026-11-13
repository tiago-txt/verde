"use client";

import { useSecondaryInfo } from "@/lib/hooks/use-secondary-info";
import {
  SECONDARY_INFO_LABELS,
  SECONDARY_INFO_OPTIONS,
} from "@/lib/finance/row-secondary";
import { cn } from "@/lib/utils";

export function SecondaryInfoToggle() {
  const [option, setOption] = useSecondaryInfo();

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Informação secundária</p>
      <p className="text-xs text-muted-foreground">
        O que aparece na segunda linha dos lançamentos, abaixo do título.
      </p>
      <div
        role="radiogroup"
        aria-label="Informação secundária"
        className="grid grid-cols-2 gap-2"
      >
        {SECONDARY_INFO_OPTIONS.map((value) => {
          const active = option === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setOption(value)}
              className={cn(
                "min-h-12 rounded-lg border px-3 text-left text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {SECONDARY_INFO_LABELS[value]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
