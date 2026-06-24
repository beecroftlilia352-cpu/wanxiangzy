"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/ui/empty-state";
import { AdminSection } from "@/components/admin/AdminPrimitives";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AdminCostDailyItem, AdminCostReport, AdminOverview } from "@/lib/admin/data";

type AdminDashboardChartsProps = {
  overview: AdminOverview;
  report: AdminCostReport;
  days: number;
};

/* ----------------------------------------------------------------------------
 * Chart configs — every key uses the `theme: { light, dark }` shape so
 * <ChartContainer> auto-injects per-theme CSS variables. Codex palette
 * matches the rest of the admin area (badges, status pills, KPI tiles).
 * -------------------------------------------------------------------------- */
const trendConfig = {
  tasks: {
    label: "任务数",
    theme: { light: "hsl(var(--codex-accent))", dark: "hsl(var(--codex-accent))" },
  },
  failed: {
    label: "失败数",
    theme: { light: "hsl(var(--codex-danger))", dark: "hsl(var(--codex-danger))" },
  },
  margin: {
    label: "毛利",
    theme: { light: "hsl(var(--codex-success))", dark: "hsl(var(--codex-success))" },
  },
  refund: {
    label: "退款",
    theme: { light: "hsl(var(--codex-warning))", dark: "hsl(var(--codex-warning))" },
  },
  settled: {
    label: "履约",
    theme: { light: "hsl(var(--codex-faint))", dark: "hsl(var(--codex-faint))" },
  },
} satisfies ChartConfig;

const taskStatusConfig = {
  queued: {
    label: "排队中",
    theme: { light: "hsl(var(--codex-warning))", dark: "hsl(var(--codex-warning))" },
  },
  running: {
    label: "运行中",
    theme: { light: "hsl(var(--codex-running))", dark: "hsl(var(--codex-running))" },
  },
  completed: {
    label: "已完成",
    theme: { light: "hsl(var(--codex-success))", dark: "hsl(var(--codex-success))" },
  },
  failed: {
    label: "失败",
    theme: { light: "hsl(var(--codex-danger))", dark: "hsl(var(--codex-danger))" },
  },
} satisfies ChartConfig;

const moduleConfig = {
  count: {
    label: "数量",
    theme: { light: "hsl(var(--codex-accent))", dark: "hsl(var(--codex-accent))" },
  },
} satisfies ChartConfig;

const modelConfig = {
  margin: {
    label: "毛利代理",
    theme: { light: "hsl(var(--codex-success))", dark: "hsl(var(--codex-success))" },
  },
} satisfies ChartConfig;

/* ----------------------------------------------------------------------------
 * Local formatters — Intl.NumberFormat with `compact` notation keeps axis
 * ticks from being crushed when counts climb into the thousands.
 * -------------------------------------------------------------------------- */
const compactNumber = new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 });
const regularNumber = new Intl.NumberFormat("zh-CN");
const signedNumber = new Intl.NumberFormat("zh-CN", { signDisplay: "exceptZero", maximumFractionDigits: 1 });

function formatCompact(value: number) {
  return compactNumber.format(value);
}

function formatNumber(value: number) {
  return regularNumber.format(Math.round(value * 10) / 10);
}

/**
 * LabelList formatter shim — recharts passes a RenderableText union, but our
 * number pipeline only needs to format numeric values. Anything else falls
 * back to a string coercion.
 */
function labelNumber(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) return formatNumber(value);
  if (typeof value === "string") return value;
  return String(value ?? "");
}

function formatSigned(value: number) {
  return signedNumber.format(value);
}

function shortLabel(value: string, max = 10) {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}…`;
}

export function AdminDashboardCharts({ overview, report, days }: AdminDashboardChartsProps) {
  const trendData = useMemo(() => buildTrendData(report.daily), [report.daily]);
  const taskStatusData = useMemo(
    () =>
      [
        { status: "queued", type: "排队中", value: overview.taskHealth.queued },
        { status: "running", type: "运行中", value: overview.taskHealth.running },
        { status: "completed", type: "已完成", value: overview.taskHealth.completed },
        { status: "failed", type: "失败", value: overview.taskHealth.failed },
      ].filter((item) => item.value > 0),
    [overview.taskHealth],
  );
  const moduleRank = useMemo(
    () => overview.moduleStats.slice(0, 8).map((item) => ({ module: item.label, count: item.count, key: item.key })),
    [overview.moduleStats],
  );
  const modelMargin = useMemo(
    () =>
      report.models.slice(0, 8).map((item) => ({
        model: item.label,
        margin: Math.round(item.marginCredits * 10) / 10,
        key: item.key,
      })),
    [report.models],
  );
  const totalTasks = taskStatusData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(360px,1fr)]">
        <AdminSection
          title="每日趋势"
          description={`近 ${days} 天 · 任务、失败、灵点走势`}
          actions={
            <span className="text-xs font-semibold text-[var(--admin-muted)]">
              {trendData.length} 个数据点
            </span>
          }
        >
          {trendData.length ? (
            <div className="p-2 pb-3">
              <ChartContainer config={trendConfig} className="h-[300px] w-full">
                <LineChart accessibilityLayer data={trendData} margin={{ top: 8, left: 8, right: 16, bottom: 0 }}>
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
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    width={48}
                    tickFormatter={formatCompact}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent indicator="line" />}
                    cursor={{ stroke: "var(--admin-border-strong)", strokeDasharray: "3 3" }}
                  />
                  <ChartLegend verticalAlign="top" align="right" content={<ChartLegendContent />} />
                  <Line
                    type="monotone"
                    dataKey="tasks"
                    stroke="var(--color-tasks)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: "var(--color-tasks)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="failed"
                    stroke="var(--color-failed)"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0, fill: "var(--color-failed)" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="margin"
                    stroke="var(--color-margin)"
                    strokeWidth={1.5}
                    strokeOpacity={0.75}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="refund"
                    stroke="var(--color-refund)"
                    strokeWidth={1.5}
                    strokeOpacity={0.75}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="settled"
                    stroke="var(--color-settled)"
                    strokeWidth={1.5}
                    strokeOpacity={0.75}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            </div>
          ) : (
            <EmptyChart
              title="暂无趋势数据"
              description={`近 ${days} 天内没有可绘制的聚合记录。`}
            />
          )}
        </AdminSection>

        <AdminSection title="任务状态" description="实时分布">
          <div className="relative p-2 pb-3">
            <ChartContainer config={taskStatusConfig} className="h-[300px] w-full">
              <PieChart accessibilityLayer>
                <ChartTooltip content={<ChartTooltipContent indicator="dot" nameKey="type" hideLabel />} />
                <Pie
                  data={taskStatusData}
                  dataKey="value"
                  nameKey="type"
                  innerRadius={70}
                  outerRadius={104}
                  paddingAngle={2}
                  stroke="var(--admin-surface)"
                  strokeWidth={2}
                >
                  {taskStatusData.map((item) => (
                    <Cell key={item.status} fill={`var(--color-${item.status})`} />
                  ))}
                </Pie>
                <ChartLegend
                  verticalAlign="bottom"
                  align="center"
                  content={<ChartLegendContent nameKey="status" />}
                />
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-12">
              <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--admin-faint)]">
                总任务
              </span>
              <span className="mt-1 text-3xl font-black tabular-nums text-[var(--admin-fg)]">
                {formatNumber(totalTasks)}
              </span>
              <span className="mt-1 text-[11px] font-semibold text-[var(--admin-muted)]">
                实时聚合
              </span>
            </div>
          </div>
        </AdminSection>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminSection
          title="模块排行"
          description="近 500 次生成的模块分布"
        >
          {moduleRank.length ? (
            <div className="flex flex-col gap-3 p-2 pb-3">
              <ChartContainer config={moduleConfig} className="h-[300px] w-full">
                <BarChart
                  accessibilityLayer
                  data={moduleRank}
                  layout="vertical"
                  margin={{ top: 4, left: 8, right: 32, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" horizontal={false} />
                  <XAxis type="number" tickLine={false} axisLine={false} tickFormatter={formatCompact} />
                  <YAxis
                    dataKey="module"
                    type="category"
                    tickLine={false}
                    axisLine={false}
                    width={120}
                    interval={0}
                    tickFormatter={(value: string) => shortLabel(value, 10)}
                  />
                  <ChartTooltip
                    content={<ChartTooltipContent indicator="dot" nameKey="module" />}
                    cursor={{ fill: "var(--admin-surface-soft)" }}
                  />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]}>
                    <LabelList
                      dataKey="count"
                      position="right"
                      formatter={labelNumber}
                      className="fill-[var(--admin-fg)] text-[11px] font-black tabular-nums"
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
              <TopPillStrip
                items={moduleRank.slice(0, 4).map((item) => ({ key: item.key, label: item.module, value: item.count }))}
                tone="accent"
              />
            </div>
          ) : (
            <EmptyChart
              title="暂无模块统计"
              description="近 500 次生成中没有可分类的模块数据。"
            />
          )}
        </AdminSection>

        <AdminSection
          title="模型毛利代理"
          description="按净收入灵点排名的模型"
        >
          {modelMargin.length ? (
            <div className="p-2 pb-3">
              <ChartContainer config={modelConfig} className="h-[300px] w-full">
                <BarChart accessibilityLayer data={modelMargin} margin={{ top: 16, left: 8, right: 16, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--admin-border)" vertical={false} />
                  <XAxis
                    dataKey="model"
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    angle={-25}
                    textAnchor="end"
                    height={70}
                    tickFormatter={(value: string) => shortLabel(value, 8)}
                  />
                  <YAxis tickLine={false} axisLine={false} tickMargin={8} width={48} tickFormatter={formatSigned} />
                  <ChartTooltip
                    content={<ChartTooltipContent indicator="dot" nameKey="model" />}
                    cursor={{ fill: "var(--admin-surface-soft)" }}
                  />
                  <Bar dataKey="margin" fill="var(--color-margin)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="margin"
                      position="top"
                      formatter={labelNumber}
                      className="fill-[var(--admin-fg)] text-[11px] font-black tabular-nums"
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            </div>
          ) : (
            <EmptyChart
              title="暂无模型统计"
              description="选定时间窗口内没有可排名的模型毛利数据。"
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

type PillItem = { key: string; label: string; value: number };

function TopPillStrip({ items, tone }: { items: PillItem[]; tone: "accent" | "success" | "warning" | "danger" | "info" }) {
  if (!items.length) return null;
  const dotClass: Record<typeof tone, string> = {
    accent: "bg-[var(--codex-accent)]",
    success: "bg-[var(--codex-success)]",
    warning: "bg-[var(--codex-warning)]",
    danger: "bg-[var(--codex-danger)]",
    info: "bg-[var(--codex-running)]",
  };
  return (
    <ul className="flex flex-wrap items-center gap-2 px-1 pt-1" aria-label="Top 4 模块">
      {items.map((item) => (
        <li
          key={item.key}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface-soft)] px-2.5 py-1 text-[11px] font-black"
        >
          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dotClass[tone]}`} />
          <span className="truncate text-[var(--admin-fg)]">{shortLabel(item.label, 12)}</span>
          <span className="tabular-nums text-[var(--admin-muted)]">{formatNumber(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

function buildTrendData(rows: AdminCostDailyItem[]) {
  return rows.map((row) => ({
    date: row.date,
    tasks: row.tasks,
    failed: row.failed,
    gross: row.grossCredits,
    refund: row.refundCredits,
    settled: row.generationSettledCredits + row.workflowSettledCredits,
    margin: row.marginCredits,
  }));
}
