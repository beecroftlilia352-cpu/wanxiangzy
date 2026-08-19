"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  Cell,
  Pie,
  PieChart,
} from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminSection, formatNumber } from "@/components/admin/AdminPrimitives";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AdminOverview } from "@/lib/admin/data";

type AdminDashboardChartsProps = {
  overview: AdminOverview;
  days: number;
};

/* ----------------------------------------------------------------------------
 * Chart configs — every key uses the `theme: { light, dark }` shape so
 * <ChartContainer> auto-injects per-theme CSS variables.
 *
 * IMPORTANT: the codex tokens (`--codex-accent`, etc.) are HEX strings, not
 * HSL components, so wrapping them as `hsl(var(--codex-X))` produces invalid
 * CSS and renders black. We pass the resolved hex values directly to the
 * config; the SVG then references them as `var(--color-X)`, which DOES
 * resolve in modern browsers (the injected value is a valid hex color).
 * -------------------------------------------------------------------------- */
const periodResultConfig = {
  completed: {
    label: "已完成",
    theme: { light: "#22885f", dark: "#30d158" },
  },
  failed: {
    label: "失败",
    theme: { light: "#d13b35", dark: "#ff453a" },
  },
  unsettled: {
    label: "未结算",
    theme: { light: "#a66a00", dark: "#ff9f0a" },
  },
} satisfies ChartConfig;

const percentNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

function formatPercent(value: number) {
  return `${percentNumber.format(value)}%`;
}

export function AdminDashboardCharts({ overview, days }: AdminDashboardChartsProps) {
  const periodResultData = useMemo(() => buildPeriodResultData(overview), [overview]);
  const totalTasks = periodResultData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4">
        <AdminSection title="周期任务结果" description={`近 ${days} 天 · 成功、失败与未结算分布`}>
          {totalTasks > 0 ? (
            <div className="flex flex-col gap-4 p-2 pb-3">
              <div className="relative">
                <ChartContainer config={periodResultConfig} className="h-[200px] w-full">
                  <PieChart accessibilityLayer>
                    <ChartTooltip
                      content={
                        <ChartTooltipContent
                          indicator="dot"
                          nameKey="type"
                          hideLabel
                          formatter={(value, name) => [`${formatNumber(Number(value))}（${formatPercent(((Number(value) || 0) / Math.max(totalTasks, 1)) * 100)}）`, name]}
                        />
                      }
                    />
                    <Pie
                      data={periodResultData}
                      dataKey="value"
                      nameKey="type"
                      innerRadius={60}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="var(--admin-surface)"
                      strokeWidth={2}
                    >
                      {periodResultData.map((item) => (
                        <Cell
                          key={item.status}
                          fill={
                            item.status === "completed"
                              ? "var(--color-completed)"
                              : item.status === "failed"
                                ? "var(--color-failed)"
                                : "var(--color-unsettled)"
                          }
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--admin-faint)]">
                    周期任务
                  </span>
                  <span className="mt-1 text-2xl font-black tabular-nums text-[var(--admin-fg)]">
                    {formatNumber(totalTasks)}
                  </span>
                  <span className="mt-1 text-[11px] font-semibold text-[var(--admin-muted)]">
                    近 {days} 天
                  </span>
                </div>
              </div>
              <ul className="flex flex-col gap-2" aria-label="周期任务结果分布">
                {periodResultData.map((item) => {
                  const pct = totalTasks > 0 ? (item.value / totalTasks) * 100 : 0;
                  return (
                    <li key={item.status}>
                      <Link
                        href={`/admin/generations${item.status === "unsettled" ? "" : `?status=${item.status}`}`}
                        aria-label={`查看 ${item.type}（${formatNumber(item.value)} · ${formatPercent(pct)}）`}
                        className="group flex min-w-0 items-center gap-3 rounded-md border border-transparent px-2 py-1.5 motion-safe:transition-colors hover:border-[var(--admin-border)] hover:bg-[var(--admin-surface-soft)]"
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              item.status === "completed"
                                ? "var(--color-completed)"
                                : item.status === "failed"
                                  ? "var(--color-failed)"
                                  : "var(--color-unsettled)",
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-xs font-semibold text-[var(--admin-fg)]">
                          {item.type}
                        </span>
                        <span className="text-xs font-black tabular-nums text-[var(--admin-fg)]">
                          {formatNumber(item.value)}
                        </span>
                        <span className="w-12 text-right text-[11px] font-semibold tabular-nums text-[var(--admin-muted)]">
                          {formatPercent(pct)}
                        </span>
                        <ArrowUpRight
                          aria-hidden="true"
                          className="h-3.5 w-3.5 shrink-0 text-[var(--admin-faint)] motion-safe:transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--admin-fg)]"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <EmptyChart
              title="暂无周期任务数据"
              description={`近 ${days} 天内没有任务记录。`}
            />
          )}
        </AdminSection>

      </div>
    </div>
  );
}

function EmptyChart({ title, description }: { title: string; description: string }) {
  return (
    <div className="p-4">
      <EmptyState title={title} description={description} />
    </div>
  );
}

/**
 * Period result distribution intentionally excludes the all-time task queue.
 * Mixing cumulative completed tasks with a live backlog hides the operational
 * signal because the completed slice eventually dominates every other state.
 */
function buildPeriodResultData(overview: AdminOverview) {
  const { total, completed, failed } = overview.periodHealth;
  const unsettled = Math.max(0, total - completed - failed);
  const items: Array<{ status: "completed" | "failed" | "unsettled"; type: string; value: number }> = [];
  if (completed > 0) items.push({ status: "completed", type: "已完成", value: completed });
  if (failed > 0) items.push({ status: "failed", type: "失败", value: failed });
  if (unsettled > 0) items.push({ status: "unsettled", type: "未结算", value: unsettled });
  return items.sort((a, b) => b.value - a.value);
}
