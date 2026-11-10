"use client";

import { Minus, Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import { centsToInput } from "@/lib/format";
import { cn } from "@/lib/utils";

type CurrencyInputProps = {
  id?: string;
  value: number;
  onChange: (cents: number) => void;
  signed?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
};

/**
 * Campo de moeda com digitação em centavos: 123456 → 1.234,56.
 * O valor trafega sempre como inteiro (centavos).
 */
export function CurrencyInput({
  id,
  value,
  onChange,
  signed = false,
  disabled,
  autoFocus,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
}: CurrencyInputProps) {
  const negative = signed && value < 0;
  const display = centsToInput(Math.abs(value));

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const digits = event.target.value.replace(/\D/g, "").slice(0, 12);
    const cents = digits ? Number(digits) : 0;
    onChange(negative ? -cents : cents);
  }

  return (
    <div className="flex items-stretch gap-2">
      <div className="relative flex-1">
        <span
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium",
            negative ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {negative ? "− R$" : "R$"}
        </span>
        <Input
          id={id}
          value={display}
          onChange={handleChange}
          inputMode="numeric"
          autoComplete="off"
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn("pl-12 text-right tabular", className)}
        />
      </div>
      {signed && (
        <button
          type="button"
          onClick={() => onChange(-value)}
          disabled={disabled}
          aria-label={negative ? "Tornar valor positivo" : "Tornar valor negativo"}
          title={negative ? "Tornar positivo" : "Tornar negativo"}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
        >
          {negative ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
