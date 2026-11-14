"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type DecorationMode = "off" | "sutis" | "normais";

const OPTIONS: { value: DecorationMode; label: string }[] = [
  { value: "off", label: "Desligadas" },
  { value: "sutis", label: "Sutis" },
  { value: "normais", label: "Normais" },
];

export function DecorationsToggle() {
  const [mode, setMode] = useState<DecorationMode>("sutis");

  useEffect(() => {
    const stored = localStorage.getItem("verde-decorations");
    const raw = stored ?? document.documentElement.dataset.decorations ?? "sutis";
    setMode(raw === "off" || raw === "normais" ? raw : "sutis");
  }, []);

  function apply(next: DecorationMode) {
    setMode(next);
    document.documentElement.dataset.decorations = next;
    try {
      localStorage.setItem("verde-decorations", next);
    } catch {
      // Storage indisponível: vale só nesta sessão.
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-grout bg-forest-container/40 p-3 sm:flex-row sm:items-center sm:justify-between max-sm:rounded-none max-sm:border-0 max-sm:bg-transparent max-sm:p-0">
      <div className="flex items-start gap-3">
        <span className="tile grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-grout bg-forest-high text-amber">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="text-sm font-medium">Decorações</p>
          <p className="text-xs text-muted-foreground">
            Padrões, brilhos e glifos. Pastilhas continuam; no modo desligado o
            emblema fica oculto.
          </p>
        </div>
      </div>
      <div
        role="group"
        aria-label="Intensidade das decorações"
        className="flex rounded-lg border border-grout bg-surface-lowest p-1"
      >
        {OPTIONS.map((option) => {
          const active = mode === option.value;
          return (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={active ? "default" : "ghost"}
              className={cn("h-11 flex-1 px-3 sm:h-9", active && "enamel")}
              aria-pressed={active}
              onClick={() => apply(option.value)}
            >
              {option.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
