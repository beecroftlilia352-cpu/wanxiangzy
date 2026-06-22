import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Reusable loading primitives used by every `loading.tsx` in the app.
 * All shapes inherit `motion-safe:animate-pulse` via the Skeleton component
 * and respect `prefers-reduced-motion` automatically.
 */

export function PageFallback({
  children,
  className,
  busy = true,
}: {
  children: React.ReactNode;
  className?: string;
  busy?: boolean;
}) {
  return (
    <div
      aria-busy={busy}
      aria-live="polite"
      className={cn("w-full", className)}
    >
      {children}
    </div>
  );
}

export function HeroFallback({
  showActions = true,
  className,
}: {
  showActions?: boolean;
  className?: string;
}) {
  return (
    <section className={cn("admin-page-hero", className)}>
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-3 w-16 rounded-full" />
        <Skeleton className="h-8 w-44 rounded-md" />
        <Skeleton className="h-4 w-full max-w-[560px] rounded-md" />
      </div>
      {showActions ? (
        <div className="hidden items-center gap-2 sm:flex">
          <Skeleton className="h-9 w-28 rounded-md" />
          <Skeleton className="h-9 w-20 rounded-md" />
        </div>
      ) : null}
    </section>
  );
}

export function CardFallback({
  title = true,
  lines = 3,
  className,
}: {
  title?: boolean;
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 shadow-sm", className)}>
      {title ? <Skeleton className="mb-3 h-4 w-28 rounded-md" /> : null}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, index) => (
          <Skeleton
            key={index}
            className="h-3 rounded-md"
            style={{ width: `${Math.max(40, 92 - index * 16)}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export function MetricGridFallback({
  count = 4,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-4", className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <Skeleton className="h-3 w-20 rounded-md" />
          <Skeleton className="mt-3 h-7 w-24 rounded-md" />
          <Skeleton className="mt-3 h-3 w-16 rounded-md" />
        </div>
      ))}
    </div>
  );
}

export function TableFallback({
  rows = 6,
  columns = 5,
  showPagination = true,
  className,
}: {
  rows?: number;
  columns?: number;
  showPagination?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-24 rounded-md" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-48 rounded-md" />
          <Skeleton className="h-9 w-28 rounded-md" />
        </div>
      </div>
      <div className="p-4">
        <div className="overflow-hidden rounded-md border border-border">
          <div
            className="grid gap-3 border-b border-border bg-muted/50 p-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-16 rounded-md" />
            ))}
          </div>
          <div className="divide-y divide-border">
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                className="grid gap-3 p-3"
                style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
              >
                {Array.from({ length: columns }).map((_, columnIndex) => (
                  <Skeleton
                    key={columnIndex}
                    className="h-4 rounded-md"
                    style={{
                      width: columnIndex === 0
                        ? "80%"
                        : `${44 + ((rowIndex + columnIndex) % 4) * 12}%`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        {showPagination ? (
          <div className="mt-3 flex items-center justify-between gap-3">
            <Skeleton className="h-4 w-28 rounded-md" />
            <div className="flex gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-8 w-8 rounded-md" />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ListFallback({
  count = 4,
  withAvatar = false,
  className,
}: {
  count?: number;
  withAvatar?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card shadow-sm", className)}>
      <div className="flex min-h-12 items-center border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-24 rounded-md" />
      </div>
      <div className="divide-y divide-border p-4">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="flex items-center justify-between gap-3 py-3">
            <div className="flex min-w-0 flex-1 items-start gap-3">
              {withAvatar ? <Skeleton className="h-9 w-9 shrink-0 rounded-full" /> : null}
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

export function ChartFallback({
  variant = "line",
  className,
}: {
  variant?: "line" | "bar" | "donut";
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card shadow-sm", className)}>
      <div className="flex min-h-12 items-center justify-between border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-28 rounded-md" />
        <Skeleton className="h-4 w-16 rounded-md" />
      </div>
      <div className="p-4">
        {variant === "donut" ? (
          <div className="flex h-[300px] items-center justify-center">
            <Skeleton className="h-48 w-48 rounded-full" />
          </div>
        ) : variant === "bar" ? (
          <div className="h-[300px] space-y-3 rounded-md bg-muted/40 p-5">
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
        ) : (
          <div className="h-[300px] space-y-3 rounded-md bg-muted/40 p-5">
            <div className="flex h-full flex-col justify-end gap-3">
              {Array.from({ length: 3 }).map((_, series) => (
                <Skeleton
                  key={series}
                  className="rounded-md"
                  style={{ height: `${36 + (series * 8) % 28}%` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
