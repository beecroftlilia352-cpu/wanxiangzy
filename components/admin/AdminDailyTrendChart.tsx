"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminSection, formatNumber } from "@/components/admin/AdminPrimitives";
import type { AdminOverview } from "@/lib/admin/data";

type TrendPoint = {
  date: string;
  tasks: number;
  completed: number;
  failed: number;
  creditsSpent: number;
};

/**
 * 每日趋势折线图：任务量 + 灵点消耗双系列。
 * 国内主流后台风格：渐变面积 + 双 Y 轴 + 图例 + 数据点 tooltip。
 */
export function AdminDailyTrendChart({ stats, days }: { stats: AdminOverview["dailyStats"]; days: number }) {
  const data = useMemo<TrendPoint[]>(() => {
    const rows = stats.map((item) => ({
      date: item.date.slice(5),
      tasks: item.tasks,
      completed: item.completed,
      failed: item.failed,
      creditsSpent: Math.round(item.creditsSpent),
    }));
    return rows.length ? rows : [];
  }, [stats]);

  const totals = useMemo(() => {
    const tasks = data.reduce((sum, row) => sum + row.tasks, 0);
    const credits = data.reduce((sum, row) => sum + row.creditsSpent, 0);
    return { tasks, credits };
  }, [data]);

  return (
    <AdminSection
      title="每日趋势"
      description={`近 ${days} 天 · 共 ${formatNumber(totals.tasks)} 个任务 · 结算灵点 ${formatNumber(totals.credits)}`}
    >
      {data.length ? (
        <div className="p-3 pb-4">
          <div className="mb-2 flex items-center justify-end gap-4 pr-2 text-[11px] font-bold text-[var(--admin-muted)]">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#5b7cff]" />
              生成任务（左轴）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#22c55e]" />
              成功（左轴）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#f59e0b]" />
              失败（左轴）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#a855f7]" />
              灵点结算（右轴）
            </span>
          </div>
          <div className="h-[280px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 4, left: 0, right: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={28}
                  tick={{ fontSize: 11, fill: "var(--admin-faint)" }}
                />
                <YAxis
                  yAxisId="left"
                  tickLine={false}
                  axisLine={false}
                  width={40}
                  tick={{ fontSize: 11, fill: "var(--admin-faint)" }}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={44}
                  tick={{ fontSize: 11, fill: "var(--admin-faint)" }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--admin-border)",
                    background: "var(--admin-surface)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [formatNumber(Number(value || 0)), String(name)]}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="tasks"
                  name="生成任务"
                  stroke="#5b7cff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="completed"
                  name="成功"
                  stroke="#22c55e"
                  strokeWidth={1.5}
                  strokeOpacity={0.9}
                  dot={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="failed"
                  name="失败"
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="creditsSpent"
                  name="灵点结算"
                  stroke="#a855f7"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="p-4">
          <EmptyState title="暂无趋势数据" description={`近 ${days} 天内没有可绘制的任务记录。`} />
        </div>
      )}
    </AdminSection>
  );
}
