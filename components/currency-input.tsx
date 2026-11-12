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
  large?: boolean;
  className?: string;
  inputMode?: "numeric" | "decimal" | "none";
  onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
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
  large = false,
  className,
  inputMode = "numeric",
  onKeyDown,
  onBlur,
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
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium",
            large ? "text-base" : "text-sm",
            negative ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {negative ? "− R$" : "R$"}
        </span>
        <Input
          id={id}
          value={display}
          onChange={handleChange}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          inputMode={inputMode}
          autoComplete="off"
          disabled={disabled}
          autoFocus={autoFocus}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedBy}
          className={cn(
            "text-right tabular",
            large ? "h-14 pl-14 text-2xl font-semibold" : "pl-12",
            className,
          )}
        />
      </div>
      {signed && (
        <button
          type="button"
          onClick={() => onChange(-value)}
          disabled={disabled}
          aria-label={negative ? "Tornar valor positivo" : "Tornar valor negativo"}
          title={negative ? "Tornar positivo" : "Tornar negativo"}
          className={cn(
            "grid shrink-0 place-items-center rounded-md border border-input bg-background text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50",
            large ? "h-14 w-12" : "h-11 w-11",
          )}
        >
          {negative ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}
