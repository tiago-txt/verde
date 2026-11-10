"use client";

import { COLOR_PALETTE } from "@/lib/colors";
import { cn } from "@/lib/utils";

type ColorPickerProps = {
  value: string;
  onChange: (color: string) => void;
  disabled?: boolean;
};

export function ColorPicker({ value, onChange, disabled }: ColorPickerProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Cor">
      {COLOR_PALETTE.map((color) => {
        const selected = value.toLowerCase() === color.value.toLowerCase();
        return (
          <button
            key={color.value}
            type="button"
            onClick={() => onChange(color.value)}
            disabled={disabled}
            aria-label={color.label}
            aria-pressed={selected}
            title={color.label}
            className={cn(
              "h-9 w-9 rounded-full border-2 transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected
                ? "scale-110 border-foreground shadow-sm"
                : "border-transparent hover:scale-105",
            )}
            style={{ backgroundColor: color.value }}
          />
        );
      })}
    </div>
  );
}
