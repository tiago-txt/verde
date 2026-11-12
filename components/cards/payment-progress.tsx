"use client";

import { cn } from "@/lib/utils";
import { filledSegments } from "@/lib/design/progress";

export function PaymentProgress({
  pago,
  total,
  className,
}: {
  pago: number;
  total: number;
  className?: string;
}) {
  const ratio = total > 0 ? Math.min(1, Math.max(0, pago / total)) : 0;
  const segments = 12;
  const filled = filledSegments(ratio * 100, segments);
  const tone =
    ratio >= 1 ? "bg-emerald" : ratio > 0 ? "bg-primary" : "bg-forest-highest";

  return (
    <span
      role="progressbar"
      aria-label="Quitação da fatura"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(pago, total)}
      className={cn("flex w-full gap-0.5", className)}
    >
      {Array.from({ length: segments }).map((_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "h-2 w-4 flex-none rounded-[4px] border border-grout/50",
            index < filled ? tone : "bg-forest-highest",
          )}
        />
      ))}
    </span>
  );
}
