import { Skeleton } from "@/components/ui/skeleton";

export default function AdminGenerationsLoading() {
  return (
    <div className="w-full space-y-4" aria-busy="true" aria-live="polite">
      <section className="admin-page-hero">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-md" />
          <Skeleton className="h-4 w-full max-w-[520px] rounded-md" />
        </div>
        <Skeleton className="hidden h-9 w-24 rounded-md sm:block" />
      </section>

      <section className="grid gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <Skeleton className="h-3 w-20 rounded-md" />
            <Skeleton className="mt-3 h-7 w-24 rounded-md" />
            <Skeleton className="mt-3 h-3 w-16 rounded-md" />
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <Skeleton className="h-4 w-20 rounded-md" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-9 w-48 rounded-md" />
            <Skeleton className="h-9 w-32 rounded-md" />
            <Skeleton className="h-9 w-28 rounded-md" />
            <Skeleton className="h-9 w-16 rounded-md" />
          </div>
        </div>
        <div className="p-4">
          <div className="overflow-hidden rounded-md border border-border">
            <div className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.7fr_0.8fr_0.5fr_0.8fr_0.6fr_0.8fr_0.7fr] gap-3 border-b border-border bg-muted/50 p-3">
              {Array.from({ length: 10 }).map((_, index) => (
                <Skeleton key={index} className="h-3 w-16 rounded-md" />
              ))}
            </div>
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, rowIndex) => (
                <div key={rowIndex} className="grid grid-cols-[1.6fr_0.8fr_0.8fr_0.7fr_0.8fr_0.5fr_0.8fr_0.6fr_0.8fr_0.7fr] gap-3 p-3">
                  {Array.from({ length: 10 }).map((_, columnIndex) => (
                    <Skeleton
                      key={columnIndex}
                      className="h-4 rounded-md"
                      style={{ width: columnIndex === 0 ? "80%" : `${48 + ((rowIndex + columnIndex) % 3) * 14}%` }}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
