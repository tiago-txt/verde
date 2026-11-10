import Link from "next/link";
import { Leaf } from "lucide-react";
import { cn } from "@/lib/utils";

type BrandProps = {
  compact?: boolean;
  className?: string;
  href?: string;
};

export function Brand({ compact = false, className, href = "/" }: BrandProps) {
  return (
    <Link
      href={href}
      aria-label="Verde — início"
      className={cn(
        "inline-flex items-center gap-2.5 rounded-md outline-none",
        className,
      )}
    >
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground shadow-sm">
        <Leaf className="h-5 w-5" aria-hidden="true" />
      </span>
      {!compact && (
        <span className="text-lg font-semibold tracking-tight">
          verde<span className="text-primary">.</span>
        </span>
      )}
    </Link>
  );
}
