import { Skeleton } from "@/components/ui/skeleton";

export default function TransactionsLoading() {
  return (
    <div className="pb-[3.25rem] lg:pb-0">
      <div className="flex items-center gap-2">
        <Skeleton className="h-11 w-44" />
        <Skeleton className="ml-auto h-11 w-11 rounded-lg" />
        <Skeleton className="h-11 w-11 rounded-lg" />
        <Skeleton className="h-11 w-11 rounded-lg" />
      </div>

      <div className="mt-4 space-y-4">
        {Array.from({ length: 3 }).map((_, group) => (
          <div key={group} className="border-b border-border">
            <div className="flex h-10 items-center justify-between border-b border-border px-0">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-6" />
                <Skeleton className="h-3 w-8" />
              </div>
              <Skeleton className="h-4 w-32" />
            </div>
            {Array.from({ length: 3 }).map((_, row) => (
              <div
                key={row}
                className="flex min-h-16 items-center gap-3 border-b border-border px-0 last:border-b-0"
              >
                <Skeleton className="h-10 w-10 rounded-[12px]" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-4 w-2/5" />
                  <Skeleton className="h-3 w-3/5" />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-3 w-14" />
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
