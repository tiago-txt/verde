"use client";

import { Delete } from "lucide-react";
import { applyKeypadKey } from "@/lib/finance/numeric-keypad";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"];

export function NumericKeypad({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (cents: number) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("grid grid-cols-3 gap-0.5", className)}
      role="group"
      aria-label="Teclado numérico"
    >
      {KEYS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(applyKeypadKey(value, key))}
          aria-label={key === "00" ? "Dois zeros" : `Dígito ${key}`}
          className="pressable grid h-12 place-items-center rounded-xl bg-muted text-xl font-semibold tabular-nums text-foreground hover:bg-accent active:bg-accent"
        >
          {key}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(applyKeypadKey(value, "backspace"))}
        aria-label="Apagar último dígito"
        className="pressable grid h-12 place-items-center rounded-xl bg-muted text-muted-foreground hover:bg-accent active:bg-accent"
      >
        <Delete className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
