import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionsLoading() {
  return (
    <div className="space-y-4 pb-48 lg:pb-28">
      <div className="flex items-center gap-3">
        <div className="hidden flex-1 space-y-2 lg:block">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-11 w-40" />
        <Skeleton className="ml-auto h-11 w-11 rounded-full" />
        <Skeleton className="h-11 w-11 rounded-full" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 w-24 rounded-full" />
        ))}
      </div>

      {Array.from({ length: 3 }).map((_, group) => (
        <div
          key={group}
          className="overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-2.5">
            <Skeleton className="h-5 w-6" />
            <Skeleton className="h-3 w-8" />
            <Skeleton className="ml-auto h-3 w-24" />
          </div>
          {Array.from({ length: 3 }).map((_, row) => (
            <div key={row} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3 w-3/5" />
              </div>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-12 w-12 rounded-xl" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
