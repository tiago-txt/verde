"use client";

import { useEffect, useState } from "react";
import { Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  DEFAULT_PALETTE,
  PALETTE_OPTIONS,
  PALETTE_STORAGE_KEY,
  parsePalette,
  type PaletteId,
} from "@/lib/theme-palette";

export function PaletteToggle() {
  const [palette, setPalette] = useState<PaletteId>(DEFAULT_PALETTE);

  useEffect(() => {
    const stored =
      localStorage.getItem(PALETTE_STORAGE_KEY) ??
      document.documentElement.dataset.palette;
    setPalette(parsePalette(stored));
  }, []);

  function apply(next: PaletteId) {
    setPalette(next);
    if (next === DEFAULT_PALETTE) {
      delete document.documentElement.dataset.palette;
    } else {
      document.documentElement.dataset.palette = next;
    }
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, next);
    } catch {
      // Storage indisponível: vale só nesta sessão.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-grout bg-forest-container/40 p-3 sm:flex-row sm:items-center sm:justify-between max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
      <div className="flex items-start gap-3">
        <span className="tile grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-grout bg-forest-high text-primary">
          <Palette className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">Paleta de cores</p>
          <p className="text-xs text-muted-foreground">
            O rosa pastel é aplicado por cima do tema claro ou escuro, com tons
            mais suaves.
          </p>
        </div>
      </div>
      <div
        role="group"
        aria-label="Paleta de cores"
        className="flex rounded-lg border border-grout bg-surface-lowest p-1"
      >
        {PALETTE_OPTIONS.map((option) => {
          const active = palette === option.id;
          return (
            <Button
              key={option.id}
              type="button"
              size="sm"
              variant={active ? "default" : "ghost"}
              className={cn("h-11 flex-1 px-3 sm:h-9", active && "enamel")}
              aria-pressed={active}
              onClick={() => apply(option.id)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
