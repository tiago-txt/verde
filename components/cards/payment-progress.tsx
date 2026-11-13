"use client";

import { cn } from "@/lib/utils";

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
  const tone =
    ratio >= 1 ? "bg-emerald" : ratio > 0 ? "bg-primary" : "bg-transparent";

  return (
    <span
      role="progressbar"
      aria-label="Quitação da fatura"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={Math.min(pago, total)}
      className={cn(
        "block h-1.5 w-full overflow-hidden rounded-full bg-forest-highest",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("block h-full rounded-full transition-[width] duration-300", tone)}
        style={{ width: `${ratio * 100}%` }}
      />
    </span>
  );
}
