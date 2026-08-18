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
  failed: number;
  successRate: number | null;
};

/**
 * Daily operating signal: volume, failure count and settled success rate.
 */
export function AdminDailyTrendChart({ stats, days }: { stats: AdminOverview["dailyStats"]; days: number }) {
  const data = useMemo<TrendPoint[]>(() => {
    const rows = stats.map((item) => {
      const settled = item.completed + item.failed;
      return {
        date: item.date.slice(5),
        tasks: item.tasks,
        failed: item.failed,
        successRate: settled > 0 ? Math.round((item.completed / settled) * 1000) / 10 : null,
      };
    });
    return rows.length ? rows : [];
  }, [stats]);

  const totals = useMemo(() => {
    const tasks = data.reduce((sum, row) => sum + row.tasks, 0);
    const completed = stats.reduce((sum, row) => sum + row.completed, 0);
    const failed = stats.reduce((sum, row) => sum + row.failed, 0);
    const settled = completed + failed;
    return { tasks, successRate: settled > 0 ? (completed / settled) * 100 : 0 };
  }, [data, stats]);

  return (
    <AdminSection
      title="生成质量趋势"
      description={`近 ${days} 天 · ${formatNumber(totals.tasks)} 个任务 · 已结算成功率 ${totals.successRate.toFixed(1)}%`}
    >
      {data.length ? (
        <div className="p-3 pb-4">
          <div className="mb-2 flex flex-wrap items-center justify-start gap-4 pr-2 text-[11px] font-bold text-[var(--admin-muted)] sm:justify-end">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#5b7cff]" />
              生成任务（左轴）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#d13b35]" />
              失败（左轴）
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2 w-2 rounded-full bg-[#22c55e]" />
              成功率（右轴）
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
                  domain={[0, 100]}
                  tickFormatter={(value) => `${value}%`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid var(--admin-border)",
                    background: "var(--admin-surface)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [name === "成功率" ? `${Number(value || 0).toFixed(1)}%` : formatNumber(Number(value || 0)), String(name)]}
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
                  dataKey="failed"
                  name="失败"
                  stroke="#d13b35"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  dot={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="successRate"
                  name="成功率"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  connectNulls={false}
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
