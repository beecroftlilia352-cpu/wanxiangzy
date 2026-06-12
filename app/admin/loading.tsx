import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <div className="w-full space-y-4" aria-busy="true" aria-live="polite">
      <section className="admin-page-hero">
        <div className="min-w-0 flex-1 space-y-2">
          <Skeleton className="h-3 w-16 rounded-full" />
          <Skeleton className="h-8 w-44 rounded-md" />
          <Skeleton className="h-4 w-full max-w-[560px] rounded-md" />
        </div>
        <div className="hidden items-center gap-2 sm:flex">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <MetricSkeleton key={index} />
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.95fr)]">
        <ChartSkeleton variant="line" />
        <ChartSkeleton variant="donut" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartSkeleton variant="bar" />
        <ChartSkeleton variant="bar" />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.8fr)]">
        <TableSkeleton rows={6} columns={5} />
        <ListSkeleton />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TableSkeleton rows={5} columns={4} />
        <TableSkeleton rows={5} columns={4} />
      </section>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
        </div>
        <Skeleton className="h-9 w-9 rounded-md" />
      </div>
      <Skeleton className="mt-4 h-3 w-28 rounded-md" />
    </div>
  );
}

function ChartSkeleton({ variant }: { variant: "line" | "donut" | "bar" }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex min-h-12 items-center justify-between border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-4 w-16 rounded-md" />
      </div>
      <div className="p-4">
        {variant === "donut" ? (
          <div className="flex h-[300px] items-center justify-center">
            <Skeleton className="h-48 w-48 rounded-full" />
          </div>
        ) : (
          <div className="h-[300px] space-y-4 rounded-md bg-muted/40 p-5">
            <div className="flex h-full items-end gap-3">
              {Array.from({ length: 12 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="flex-1 rounded-t-md"
                  style={{ height: `${28 + ((index * 17) % 62)}%` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TableSkeleton({ rows, columns }: { rows: number; columns: number }) {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex min-h-12 items-center justify-between border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-4 w-20 rounded-md" />
      </div>
      <div className="p-4">
        <div className="overflow-hidden rounded-md border border-border">
          <div className="grid gap-3 border-b border-border bg-muted/50 p-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: columns }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-16 rounded-md" />
            ))}
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <div key={rowIndex} className="grid gap-3 p-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {Array.from({ length: columns }).map((_, columnIndex) => (
                  <Skeleton
                    key={columnIndex}
                    className="h-4 rounded-md"
                    style={{ width: columnIndex === 0 ? "72%" : `${44 + ((rowIndex + columnIndex) % 4) * 12}%` }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <Skeleton className="h-4 w-28 rounded-md" />
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-8 rounded-md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card shadow-sm">
      <div className="flex min-h-12 items-center border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-24 rounded-md" />
      </div>
      <div className="divide-y divide-border p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              <Skeleton className="h-7 w-14 rounded-md" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-32 rounded-md" />
                <Skeleton className="h-3 w-full max-w-[260px] rounded-md" />
              </div>
            </div>
            <Skeleton className="h-4 w-10 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}
