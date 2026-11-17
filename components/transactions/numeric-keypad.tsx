"use client";

import { Delete } from "lucide-react";
import type { KeypadOperator } from "@/lib/finance/numeric-keypad";
import { cn } from "@/lib/utils";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "00", "0"];

type NumericKeypadProps = {
  onKey: (key: string) => void;
  className?: string;
  calculator?: {
    operator: KeypadOperator | null;
    onOperator: (operator: KeypadOperator) => void;
    onEquals: () => void;
    onClear: () => void;
  };
};

export function NumericKeypad({
  onKey,
  className,
  calculator,
}: NumericKeypadProps) {
  return (
    <div className={cn("space-y-0.5", className)}>
      {calculator && (
        <div
          className="grid grid-cols-4 gap-0.5"
          role="group"
          aria-label="Operações da calculadora"
        >
          {(
            [
              { key: "+", label: "Somar", symbol: "+" },
              { key: "-", label: "Subtrair", symbol: "−" },
            ] as const
          ).map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => calculator.onOperator(item.key)}
              aria-label={item.label}
              aria-pressed={calculator.operator === item.key}
              className={cn(
                "pressable grid h-12 place-items-center rounded-xl text-xl font-semibold transition-colors",
                calculator.operator === item.key
                  ? "bg-primary/15 text-primary"
                  : "bg-muted text-foreground hover:bg-accent active:bg-accent",
              )}
            >
              {item.symbol}
            </button>
          ))}
          <button
            type="button"
            onClick={calculator.onEquals}
            aria-label="Calcular resultado"
            className="pressable grid h-12 place-items-center rounded-xl bg-muted text-xl font-semibold text-foreground hover:bg-accent active:bg-accent"
          >
            =
          </button>
          <button
            type="button"
            onClick={calculator.onClear}
            aria-label="Limpar cálculo"
            className="pressable grid h-12 place-items-center rounded-xl bg-muted text-sm font-semibold text-muted-foreground hover:bg-accent active:bg-accent"
          >
            C
          </button>
        </div>
      )}

      <div
        className="grid grid-cols-3 gap-0.5"
        role="group"
        aria-label="Teclado numérico"
      >
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => onKey(key)}
            aria-label={key === "00" ? "Dois zeros" : `Dígito ${key}`}
            className="pressable grid h-12 place-items-center rounded-xl bg-muted text-xl font-semibold tabular-nums text-foreground hover:bg-accent active:bg-accent"
          >
            {key}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onKey("backspace")}
          aria-label="Apagar último dígito"
          className="pressable grid h-12 place-items-center rounded-xl bg-muted text-muted-foreground hover:bg-accent active:bg-accent"
        >
          <Delete className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
