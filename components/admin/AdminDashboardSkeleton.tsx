/** 运营总览数据骨架：数据流式到达前的占位（KPI 卡 + 图表区 + 任务表） */
export function AdminDashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="运营数据加载中" className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="admin-skeleton-card h-[92px] rounded-xl" />
        ))}
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="admin-skeleton-card h-[76px] rounded-lg" />
        ))}
      </section>
      <div className="admin-skeleton-card h-[360px] rounded-xl" aria-hidden="true" />
      <div className="admin-skeleton-card h-[280px] rounded-xl" aria-hidden="true" />
    </div>
  );
}
