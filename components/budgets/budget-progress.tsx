"use client";

import { cn } from "@/lib/utils";

type BudgetProgressProps = {
  gasto: number;
  limite: number;
  label?: string;
  className?: string;
  size?: "sm" | "md";
};

export function budgetTone(gasto: number, limite: number): {
  bar: string;
  text: string;
  badge: "success" | "warning" | "destructive";
} {
  const percent = limite > 0 ? (gasto / limite) * 100 : gasto > 0 ? 100 : 0;
  if (percent >= 100) {
    return { bar: "bg-destructive", text: "text-destructive", badge: "destructive" };
  }
  if (percent >= 80) {
    return { bar: "bg-warning", text: "text-warning", badge: "warning" };
  }
  return { bar: "bg-primary", text: "text-primary", badge: "success" };
}

export function BudgetProgress({
  gasto,
  limite,
  label,
  className,
  size = "md",
}: BudgetProgressProps) {
  const percent = limite > 0 ? Math.round((gasto / limite) * 100) : gasto > 0 ? 100 : 0;
  const tone = budgetTone(gasto, limite);
  const width = Math.min(100, Math.max(0, percent));
  const segments = 12;
  const filled = Math.round((width / 100) * segments);

  return (
    <div
      role="progressbar"
      aria-label={label ?? "Progresso do orçamento"}
      aria-valuemin={0}
      aria-valuemax={limite}
      aria-valuenow={Math.min(gasto, limite)}
      aria-valuetext={`${percent}% do limite`}
      className={cn("flex w-full gap-0.5", className)}
    >
      {Array.from({ length: segments }).map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "flex-1 rounded-[3px] transition-colors",
            size === "sm" ? "h-1.5" : "h-2",
            index < filled ? tone.bar : "bg-muted",
          )}
        />
      ))}
    </div>
  );
}
