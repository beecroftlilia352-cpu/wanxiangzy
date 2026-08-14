/** 运营总览数据骨架：与新布局对应的占位（KPI → 折线图+环形图 → 柱状图+异常 → 任务表） */
export function AdminDashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="运营数据加载中" className="flex flex-col gap-5">
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="admin-skeleton-card h-[92px] rounded-xl" />
        ))}
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]" aria-hidden="true">
        <div className="admin-skeleton-card h-[380px] rounded-xl" />
        <div className="admin-skeleton-card h-[380px] rounded-xl" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2" aria-hidden="true">
        <div className="admin-skeleton-card h-[330px] rounded-xl" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="admin-skeleton-card h-[76px] rounded-lg" />
          ))}
        </div>
      </div>
      <div className="admin-skeleton-card h-[300px] rounded-xl" aria-hidden="true" />
    </div>
  );
}
