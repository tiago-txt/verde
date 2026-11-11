import { cn } from "@/lib/utils";

export function DashboardSkeleton({
  className,
  lines = 3,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-xl border border-border bg-card p-4",
        className,
      )}
      aria-hidden="true"
    >
      <div className="h-4 w-32 rounded bg-muted" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <div
            key={index}
            className="h-3 rounded bg-muted"
            style={{ width: `${90 - index * 15}%` }}
          />
        ))}
      </div>
    </div>
  );
}
