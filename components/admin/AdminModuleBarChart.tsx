"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminSection, formatNumber } from "@/components/admin/AdminPrimitives";
import type { AdminOverview } from "@/lib/admin/data";

/**
 * 模块任务排行横向柱状图：任务量与失败量对比，国内主流后台风格。
 */
export function AdminModuleBarChart({ stats, days }: { stats: AdminOverview["moduleStats"]; days: number }) {
  const data = useMemo(() => {
    const rows = stats
      .slice(0, 8)
      .map((item) => ({ name: item.label, tasks: item.count, failed: item.failed }))
      .sort((a, b) => a.tasks - b.tasks);
    return rows;
  }, [stats]);

  return (
    <AdminSection title="模块任务排行" description={`近 ${days} 天 · 按任务量排序（含失败对比）`}>
      {data.length ? (
        <div className="p-3 pb-4">
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 0, left: 8, right: 24, bottom: 0 }} barCategoryGap={10}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" horizontal={false} />
                <XAxis type="number" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--admin-faint)" }} allowDecimals={false} />
                <YAxis type="category" dataKey="name" width={86} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "var(--admin-fg)", fontWeight: 700 }} />
                <Tooltip
                  cursor={{ fill: "var(--admin-surface-soft)" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--admin-border)",
                    background: "var(--admin-surface)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [formatNumber(Number(value || 0)), String(name)]}
                />
                <Bar dataKey="tasks" name="任务量" radius={[0, 6, 6, 0]} barSize={14}>
                  {data.map((item) => (
                    <Cell key={item.name} fill={item.failed > 0 && item.failed / item.tasks > 0.08 ? "#5b7cff" : "#22c55e"} />
                  ))}
                </Bar>
                <Bar dataKey="failed" name="失败" radius={[0, 6, 6, 0]} barSize={14} fill="#f59e0b" fillOpacity={0.85} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 pr-2 text-right text-[10px] font-semibold text-[var(--admin-faint)]">
            蓝色=任务量（失败率超 8% 高亮）· 橙色=失败数
          </p>
        </div>
      ) : (
        <div className="p-4">
          <EmptyState title="暂无模块任务" description={`近 ${days} 天内没有可聚合的模块数据。`} />
        </div>
      )}
    </AdminSection>
  );
}
