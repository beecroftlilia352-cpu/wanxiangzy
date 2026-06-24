import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/* ----------------------------------------------------------------------------
 * Reusable admin skeleton primitives.
 *
 * Shared between the global /admin loading.tsx fallback and per-page inline
 * skeletons. The shapes match the live cards (AdminMetricCard, AdminSection,
 * AdminTable) so users see a faithful preview of the real layout.
 * -------------------------------------------------------------------------- */

export function AdminCardSkeleton({
  titleWidth = "w-28",
  actionsWidth = "w-16",
  children,
  className,
}: {
  titleWidth?: string;
  actionsWidth?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-sm", className)}>
      <div className="flex min-h-12 items-center justify-between border-b border-[var(--admin-border)] px-4 py-3">
        <Skeleton className={cn("h-4 rounded-md", titleWidth)} />
        <Skeleton className={cn("h-4 rounded-md", actionsWidth)} />
      </div>
      {children}
    </div>
  );
}

export function AdminMetricSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex h-full flex-col gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Skeleton className="h-3 w-20 rounded-md" />
        <Skeleton className="h-7 w-[88px] rounded-md" />
      </div>
      <Skeleton className="mt-1 h-7 w-24 rounded-md" />
      <Skeleton className="mt-auto h-3 w-28 rounded-md" />
    </div>
  );
}

export function AdminChartSkeleton({
  variant,
  titleWidth = "w-28",
  actionsWidth = "w-16",
  className,
}: {
  variant: "line" | "donut" | "bar";
  titleWidth?: string;
  actionsWidth?: string;
  className?: string;
}) {
  return (
    <AdminCardSkeleton titleWidth={titleWidth} actionsWidth={actionsWidth} className={className}>
      <div className="p-4">
        {variant === "donut" ? (
          <div className="flex h-[300px] items-center justify-center">
            <Skeleton className="h-48 w-48 rounded-full" />
          </div>
        ) : (
          <div className="h-[300px] rounded-md bg-[var(--admin-surface-soft)] p-5">
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
    </AdminCardSkeleton>
  );
}

export function AdminTableSkeleton({
  rows = 6,
  columns = 5,
  titleWidth = "w-28",
  actionsWidth = "w-20",
  showFooter = true,
  className,
}: {
  rows?: number;
  columns?: number;
  titleWidth?: string;
  actionsWidth?: string;
  showFooter?: boolean;
  className?: string;
}) {
  return (
    <AdminCardSkeleton titleWidth={titleWidth} actionsWidth={actionsWidth} className={className}>
      <div className="p-4">
        <div className="overflow-hidden rounded-md border border-[var(--admin-border)]">
          <div
            className="grid gap-3 border-b border-[var(--admin-border)] bg-[var(--admin-surface-soft)] p-3"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: columns }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-16 rounded-md" />
            ))}
          </div>
          <div className="divide-y divide-[var(--admin-border)]">
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
                      width: columnIndex === 0 ? "72%" : `${44 + ((rowIndex + columnIndex) % 4) * 12}%`,
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
        {showFooter ? (
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
    </AdminCardSkeleton>
  );
}

export function AdminListSkeleton({
  rows = 4,
  titleWidth = "w-24",
  className,
}: {
  rows?: number;
  titleWidth?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] shadow-sm",
        className,
      )}
    >
      <div className="flex min-h-12 items-center border-b border-[var(--admin-border)] px-4 py-3">
        <Skeleton className={cn("h-4 rounded-md", titleWidth)} />
      </div>
      <div className="divide-y divide-[var(--admin-border)] p-4">
        {Array.from({ length: rows }).map((_, index) => (
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
