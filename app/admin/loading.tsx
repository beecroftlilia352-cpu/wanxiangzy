import { Skeleton } from "@/components/ui/skeleton";
import {
  AdminChartSkeleton,
  AdminListSkeleton,
  AdminMetricSkeleton,
  AdminTableSkeleton,
} from "@/components/ui/admin-skeletons";

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

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <AdminTableSkeleton rows={6} columns={4} showFooter={false} />
        <AdminListSkeleton rows={4} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
        <AdminChartSkeleton variant="line" />
        <AdminChartSkeleton variant="donut" />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AdminChartSkeleton variant="bar" />
        <AdminChartSkeleton variant="bar" />
      </section>
    </div>
  );
}
