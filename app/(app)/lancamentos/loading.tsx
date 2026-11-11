import { Skeleton } from "@/components/ui/skeleton";

export default function LancamentosLoading() {
  return (
    <div className="space-y-4 pb-48 lg:pb-28">
      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-11 w-32" />
        <div className="order-3 flex w-full items-center justify-center gap-2 sm:order-2 sm:w-auto sm:flex-1">
          <Skeleton className="h-11 w-11" />
          <Skeleton className="h-11 w-44" />
          <Skeleton className="h-11 w-11" />
        </div>
        <div className="order-2 ml-auto flex gap-2 sm:order-3">
          <Skeleton className="h-11 w-28" />
          <Skeleton className="h-11 w-11" />
        </div>
      </div>

      <div className="hidden flex-wrap gap-2 sm:flex">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-11 w-28" />
        ))}
      </div>
      <Skeleton className="h-11 w-full sm:hidden" />

      {Array.from({ length: 3 }).map((_, groupIndex) => (
        <div
          key={groupIndex}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="border-b border-border bg-muted/30 px-4 py-3">
            <Skeleton className="h-4 w-40" />
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((__, rowIndex) => (
              <div key={rowIndex} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
          <div className="flex justify-between border-t border-border px-4 py-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}
