import Link from "next/link";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandProps = {
  compact?: boolean;
  className?: string;
  href?: string;
};

export function Brand({
  compact = false,
  className,
  href = "/",
}: BrandProps) {
  return (
    <Link
      href={href}
      aria-label="Verde — início"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-md outline-none",
        className,
      )}
    >
      <span className="tile grid h-9 w-9 place-items-center rounded-[12px] bg-primary-fill text-primary-fill-foreground shadow-[0_0_16px_hsl(var(--primary)/.28)]">
        <Leaf className="h-5 w-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="font-display text-lg font-semibold leading-tight tracking-tight">
          Verde
        </span>
      )}
    </Link>
  );
}
