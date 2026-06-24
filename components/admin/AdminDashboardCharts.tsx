"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowUpRight } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminSection, formatNumber } from "@/components/admin/AdminPrimitives";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { AdminTopList, type AdminTopListItem } from "@/components/admin/AdminTopList";
import type { AdminCostDailyItem, AdminCostReport, AdminOverview } from "@/lib/admin/data";
import { moduleIcon } from "@/components/admin/module-icon";

type AdminDashboardChartsProps = {
  overview: AdminOverview;
  report: AdminCostReport;
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
const trendConfig = {
  tasks: {
    label: "任务数",
    theme: { light: "#5b7cff", dark: "#5b8cff" },
  },
  failureRate: {
    label: "失败率",
    theme: { light: "#d13b35", dark: "#ff453a" },
  },
} satisfies ChartConfig;

const taskStatusConfig = {
  queued: {
    label: "排队中",
    theme: { light: "#a66a00", dark: "#ff9f0a" },
  },
  running: {
    label: "运行中",
    theme: { light: "#5b7cff", dark: "#5b8cff" },
  },
  completed: {
    label: "已完成",
    theme: { light: "#22885f", dark: "#30d158" },
  },
  failed: {
    label: "失败",
    theme: { light: "#d13b35", dark: "#ff453a" },
  },
  other: {
    label: "其他",
    theme: { light: "#7b8498", dark: "#7a7d85" },
  },
} satisfies ChartConfig;

/* ----------------------------------------------------------------------------
 * Local formatters — Intl.NumberFormat with `compact` notation keeps axis
 * ticks from being crushed when counts climb into the thousands.
 * -------------------------------------------------------------------------- */
const compactNumber = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const percentNumber = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 1 });

function formatCompact(value: number) {
  return compactNumber.format(value);
}

function formatPercent(value: number) {
  return `${percentNumber.format(value)}%`;
}

function shortLabel(value: string, max = 10) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function AdminDashboardCharts({ overview, report, days }: AdminDashboardChartsProps) {
  const trendData = useMemo(() => buildTrendData(report.daily), [report.daily]);
  const taskStatusData = useMemo(() => buildTaskStatusData(overview), [overview]);
  const moduleRankItems = useMemo(
    () => buildModuleListItems(overview.moduleStats),
    [overview.moduleStats],
  );
  const modelRankItems = useMemo(
    () => buildModelListItems(report.models),
    [report.models],
  );
  const totalTasks = taskStatusData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
        <AdminSection
          title="每日趋势"
          description={`近 ${days} 天 · 任务量与失败率`}
          actions={
            <span className="text-xs font-semibold text-[var(--admin-muted)]">
              {trendData.length} 个数据点
            </span>
          }
        >
          {trendData.length ? (
            <div className="p-2 pb-3">
              <ChartContainer config={trendConfig} className="h-[300px] w-full">
                <AreaChart accessibilityLayer data={trendData} margin={{ top: 8, left: 8, right: 16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trend-tasks-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-tasks)" stopOpacity={0.32} />
                      <stop offset="100%" stopColor="var(--color-tasks)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    minTickGap={24}
                    tickFormatter={(value: string) => value.slice(5)}
                  />
                  <YAxis
                    yAxisId="left"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={48}
                    tickFormatter={formatCompact}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={40}
                    tickFormatter={(value: number) => formatPercent(value)}
                    domain={[0, 100]}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent indicator="line" />}
                    cursor={{ stroke: "var(--admin-border-strong)", strokeDasharray: "3 3" }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="tasks"
                    name="任务数"
                    stroke="var(--color-tasks)"
                    strokeWidth={2}
                    fill="url(#trend-tasks-fill)"
                    activeDot={{ r: 4, strokeWidth: 0, fill: "var(--color-tasks)" }}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="failureRate"
                    name="失败率"
                    stroke="var(--color-failureRate)"
                    strokeWidth={1.5}
                    strokeOpacity={0.85}
                    fill="transparent"
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0, fill: "var(--color-failureRate)" }}
                  />
                </AreaChart>
              </ChartContainer>
              <div className="mt-3 flex flex-wrap items-center gap-3 px-2 text-[11px] font-black text-[var(--admin-muted)]">
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-1.5 w-3 rounded-full bg-[var(--color-tasks)]" />
                  任务数（左轴）
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="h-1.5 w-3 rounded-full bg-[var(--color-failureRate)]" />
                  失败率（右轴）
                </span>
              </div>
            </div>
          ) : (
            <EmptyChart
              title="暂无趋势数据"
              description={`近 ${days} 天内没有可绘制的聚合记录。`}
            />
          )}
        </AdminSection>

        <AdminSection title="任务状态" description="实时分布 · 点击行查看队列">
          {totalTasks > 0 ? (
            <div className="flex flex-col gap-4 p-2 pb-3">
              <div className="relative">
                <ChartContainer config={taskStatusConfig} className="h-[200px] w-full">
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
                      data={taskStatusData}
                      dataKey="value"
                      nameKey="type"
                      innerRadius={60}
                      outerRadius={88}
                      paddingAngle={2}
                      stroke="var(--admin-surface)"
                      strokeWidth={2}
                    >
                      {taskStatusData.map((item) => (
                        <Cell
                          key={item.status}
                          fill={
                            item.status === "completed"
                              ? "var(--color-completed)"
                              : item.status === "failed"
                                ? "var(--color-failed)"
                                : item.status === "running"
                                  ? "var(--color-running)"
                                  : item.status === "other"
                                    ? "var(--color-other)"
                                    : "var(--color-queued)"
                          }
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--admin-faint)]">
                    总任务
                  </span>
                  <span className="mt-1 text-2xl font-black tabular-nums text-[var(--admin-fg)]">
                    {formatNumber(totalTasks)}
                  </span>
                  <span className="mt-1 text-[11px] font-semibold text-[var(--admin-muted)]">
                    实时聚合
                  </span>
                </div>
              </div>
              <ul className="flex flex-col gap-2" aria-label="任务状态分布">
                {taskStatusData.map((item) => {
                  const pct = totalTasks > 0 ? (item.value / totalTasks) * 100 : 0;
                  return (
                    <li key={item.status}>
                      <Link
                        href={`/admin/generations?status=${item.status === "other" ? "" : item.status}`}
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
                                  : item.status === "running"
                                    ? "var(--color-running)"
                                    : item.status === "other"
                                      ? "var(--color-other)"
                                      : "var(--color-queued)",
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
              title="暂无任务状态数据"
              description="等待任务结算后会按状态自动汇总。"
            />
          )}
        </AdminSection>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminSection
          title="模块排行"
          description={`近 ${days} 天内按任务数排序`}
          actions={
            <Link
              href="/admin/generations"
              className="inline-flex items-center gap-1 text-xs font-black text-[var(--admin-link)] hover:text-[var(--admin-fg)]"
            >
              查看全部
              <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
            </Link>
          }
        >
          <AdminTopList
            items={moduleRankItems}
            emptyTitle={`近 ${days} 天暂无模块任务`}
            emptyDescription="扩大时间窗口（30 天）或前往任务中心查看历史数据"
            tone="accent"
            valueFormatter={(value) => formatNumber(value)}
          />
        </AdminSection>

        <AdminSection
          title="模型毛利代理"
          description={`近 ${days} 天按净收入灵点排名的模型`}
          actions={
            <Link
              href="/admin/reports"
              className="inline-flex items-center gap-1 text-xs font-black text-[var(--admin-link)] hover:text-[var(--admin-fg)]"
            >
              进入报表
              <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
            </Link>
          }
        >
          <AdminTopList
            items={modelRankItems}
            emptyTitle={`近 ${days} 天等待模型结算`}
            emptyDescription="任务结算并写入灵点流水后会自动按模型汇总毛利"
            tone="success"
            valueFormatter={(value) => `${formatNumber(Math.round(value * 10) / 10)}`}
          />
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
 * Coalesce tiny slices into a single "其他" bucket so the donut always shows
 * 4 readable segments instead of 1 dominant slice + 3 invisible ones. Any
 * slice below 4% of the total folds into "其他" (only when at least one
 * non-completed slice exists).
 */
function buildTaskStatusData(overview: AdminOverview) {
  const queued = overview.taskHealth.queued;
  const running = overview.taskHealth.running;
  const completed = overview.taskHealth.completed;
  const failed = overview.taskHealth.failed;
  const total = queued + running + completed + failed;
  if (total === 0) return [];
  const pct = (v: number) => (v / total) * 100;
  const items: Array<{ status: string; type: string; value: number }> = [];
  if (completed > 0) items.push({ status: "completed", type: "已完成", value: completed });
  if (failed > 0) items.push({ status: "failed", type: "失败", value: failed });
  if (running > 0) items.push({ status: "running", type: "运行中", value: running });
  if (queued > 0) items.push({ status: "queued", type: "排队中", value: queued });

  // Fold small slices (other than completed) into "其他" if their share < 4%
  const big = items.filter((item) => item.status === "completed" || pct(item.value) >= 4);
  const small = items.filter((item) => item.status !== "completed" && pct(item.value) < 4);
  if (small.length) {
    const otherValue = small.reduce((sum, item) => sum + item.value, 0);
    big.push({ status: "other", type: "其他", value: otherValue });
  }
  return big.sort((a, b) => b.value - a.value);
}

function buildModuleListItems(stats: AdminOverview["moduleStats"]): AdminTopListItem[] {
  return stats.slice(0, 8).map((item) => ({
    key: item.key,
    label: item.label,
    icon: moduleIcon(item.key),
    value: item.count,
    secondary: `失败 ${formatNumber(item.failed)}`,
    href: `/admin/generations?module=${encodeURIComponent(item.key)}`,
  }));
}

function buildModelListItems(stats: AdminCostReport["models"]): AdminTopListItem[] {
  return stats.slice(0, 8).map((item) => {
    const tone: "success" | "warning" | "danger" | "neutral" =
      item.netCredits > 0 ? "success" : item.netCredits < 0 ? "danger" : "neutral";
    return {
      key: item.key,
      label: item.label,
      value: item.netCredits,
      secondary: `毛利 ${formatNumber(Math.round(item.marginCredits * 10) / 10)} · 失败 ${formatNumber(item.failed)}`,
      tone,
      href: "/admin/reports",
    };
  });
}

function buildTrendData(rows: AdminCostDailyItem[]) {
  return rows.map((row) => ({
    date: row.date,
    tasks: row.tasks,
    failureRate: row.tasks > 0 ? (row.failed / row.tasks) * 100 : 0,
  }));
}
