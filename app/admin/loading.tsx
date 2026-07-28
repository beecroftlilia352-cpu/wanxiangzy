import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminChartSkeleton,
  AdminMetricSkeleton,
  AdminTableSkeleton,
} from "@/components/ui/admin-skeletons";
import { AdminTopListSkeleton } from "@/components/admin/AdminTopList";

export default function AdminLoading() {
  return (
    <div className="flex w-full flex-col gap-5" aria-busy="true" aria-live="polite">
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

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <AdminMetricSkeleton key={index} />
        ))}
      </section>

      {/* 4-up exception strip — matches the new entry grid */}
      <section
        aria-label="异常入口"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex min-w-0 items-center gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3"
          >
            <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-5 w-16" />
            </div>
            <Skeleton className="h-4 w-4 shrink-0" />
          </div>
        ))}
      </section>

      {/* Recent tasks — full-width admin table */}
      <AdminTableSkeleton rows={6} columns={4} showFooter={false} />

      {/* Main chart row: area + donut */}
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
        <AdminChartSkeleton variant="line" />
        <AdminChartSkeleton variant="donut" />
      </section>

      {/* Breakdown row: two TopList skeletons */}
      <section className="grid gap-4 xl:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-3 w-32" />
          </div>
          <AdminTopListSkeleton rows={6} />
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)] p-2">
          <div className="flex items-center justify-between px-2 py-1">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </div>
          <AdminTopListSkeleton rows={6} />
        </div>
      </section>
    </div>
  );
}
