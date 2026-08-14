"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Coins,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  AdminSection,
  AdminMetricCard,
  AdminTable,
  AdminStatusBadge,
  adminToneColor,
  formatDateTime,
  formatNumber as formatNumberPrimitive,
} from "@/components/admin/AdminPrimitives";
import { AdminDashboardCharts } from "@/components/admin/AdminDashboardCharts";
import { AdminDailyTrendChart } from "@/components/admin/AdminDailyTrendChart";
import { AdminModuleBarChart } from "@/components/admin/AdminModuleBarChart";
import { AdminOpsAlerts } from "@/components/admin/AdminOpsAlerts";
import type { AdminOverview, AdminTaskListItem } from "@/lib/admin/data";
import type { TaskStatusGroup } from "@/lib/task-queue";

type AdminDashboardClientProps = {
  overview: AdminOverview;
  days: number;
  fetchError?: string | null;
};

type ExceptionEntry = {
  label: string;
  value: number;
  href: string;
  tone: "good" | "warning" | "danger" | "info";
  icon: React.ReactNode;
};

const exceptionToneClass: Record<ExceptionEntry["tone"], string> = {
  good: "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] text-[var(--admin-success)]",
  warning: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
  danger: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
  info: "border-[var(--admin-info-border)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
};

const exceptionSurfaceHover: Record<ExceptionEntry["tone"], string> = {
  good: "hover:border-[var(--admin-success-border)]",
  warning: "hover:border-[var(--admin-warning-border)]",
  danger: "hover:border-[var(--admin-danger-border)]",
  info: "hover:border-[var(--admin-info-border)]",
};

export function AdminDashboardClient({ overview, days, fetchError }: AdminDashboardClientProps) {
  const deltas = useMemo(() => computeKpiDeltas(overview.dailyStats), [overview.dailyStats]);
  const failureRate = overview.generationHealth.failureRate;

  const exceptionEntries: ExceptionEntry[] = [
    {
      label: "失败任务",
      value: overview.taskHealth.failed,
      href: "/admin/generations?status=failed",
      tone: "danger",
      icon: <AlertTriangle aria-hidden="true" className="h-4 w-4" />,
    },
    {
      label: "排队任务",
      value: overview.taskHealth.queued,
      href: "/admin/generations?status=queued",
      tone: "warning",
      icon: <Clock3 aria-hidden="true" className="h-4 w-4" />,
    },
    {
      label: "运行任务",
      value: overview.taskHealth.running,
      href: "/admin/generations?status=running",
      tone: "info",
      icon: <Activity aria-hidden="true" className="h-4 w-4" />,
    },
    {
      label: "近期退款",
      value: overview.creditHealth.recentRefund,
      href: "/admin/credits?reason=refund",
      tone: overview.creditHealth.recentRefund > 0 ? "warning" : "good",
      icon: <Coins aria-hidden="true" className="h-4 w-4" />,
    },
  ];

  const recentTaskColumns = [
    {
      key: "title",
      label: "任务",
      className: "max-w-[320px]",
      render: (row: AdminTaskListItem) => (
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <AdminStatusBadge
              status={row.status}
              group={(row.statusGroup as TaskStatusGroup | undefined) ?? undefined}
            />
            <span className="text-xs font-semibold text-[var(--admin-muted)]">
              {row.sourceType}
            </span>
          </div>
          <Link
            href={`/admin/generations/${row.sourceId}`}
            className="truncate text-sm font-semibold text-[var(--admin-fg)] hover:text-[var(--admin-fg)]"
          >
            {row.title}
          </Link>
          <span className="truncate text-xs text-[var(--admin-muted)]">
            任务编号 {row.sourceId.slice(0, 8)}
          </span>
        </div>
      ),
    },
    {
      key: "module",
      label: "模块",
      className: "whitespace-nowrap",
      render: (row: AdminTaskListItem) => (
        <span className="text-xs font-semibold text-[var(--admin-fg)]">
          {row.moduleLabel}
        </span>
      ),
    },
    {
      key: "progress",
      label: "进度",
      className: "w-32",
      render: (row: AdminTaskListItem) => (
        <div className="flex items-center gap-2">
          <Progress value={Math.min(100, Math.max(0, row.progress))} aria-label="任务进度" />
          <span className="w-9 text-right text-xs font-semibold tabular-nums text-[var(--admin-muted)]">
            {Math.round(row.progress)}%
          </span>
        </div>
      ),
    },
    {
      key: "createdAt",
      label: "时间",
      className: "whitespace-nowrap text-right text-xs font-semibold tabular-nums text-[var(--admin-muted)]",
      render: (row: AdminTaskListItem) => formatDateTime(row.createdAt),
    },
  ];

  return (
    <div className="flex w-full flex-col gap-5">
      {fetchError ? (
        <div className="rounded-lg border border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] px-4 py-2.5 text-sm font-semibold text-[var(--admin-danger)]">
          部分数据加载失败：{fetchError}
          <button type="button" onClick={() => window.location.reload()} className="ml-3 underline hover:no-underline">重试</button>
        </div>
      ) : null}
      {overview.warnings.length > 0 && (
        <ErrorState
          title="部分数据源暂不可用"
          description={overview.warnings.slice(0, 3).join("；")}
        />
      )}

      <AdminOpsAlerts overview={overview} />

      <section aria-label="关键指标" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AdminMetricCard
          label="生成任务"
          value={formatNumberPrimitive(overview.generationHealth.total)}
          hint={`今日 ${formatNumberPrimitive(overview.generationHealth.today)}`}
          icon={<Sparkles aria-hidden="true" className="h-4 w-4" />}
          delta={deltas.tasks}
        />
        <AdminMetricCard
          label="成功率"
          value={formatNumberPrimitive(100 - failureRate)}
          suffix="%"
          tone={failureRate > 20 ? "danger" : "good"}
          icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
          delta={deltas.successRate}
        />
        <AdminMetricCard
          label="失败率"
          value={formatNumberPrimitive(failureRate)}
          suffix="%"
          tone={failureRate > 15 ? "danger" : failureRate > 5 ? "warning" : "good"}
          icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}
          delta={deltas.failureRate}
        />
        <AdminMetricCard
          label="近期消耗"
          value={formatNumberPrimitive(overview.creditHealth.recentSpend)}
          hint={`采样余额 ${formatNumberPrimitive(overview.creditHealth.sampledBalance)}`}
          icon={<Coins aria-hidden="true" className="h-4 w-4" />}
        />
        <AdminMetricCard
          label="近期退款"
          value={formatNumberPrimitive(overview.creditHealth.recentRefund)}
          tone={overview.creditHealth.recentRefund > 0 ? "warning" : "good"}
          icon={<TrendingDown aria-hidden="true" className="h-4 w-4" />}
        />
        <AdminMetricCard
          label="采样已消耗"
          value={formatNumberPrimitive(overview.creditHealth.sampledConsumed)}
          icon={<TrendingUp aria-hidden="true" className="h-4 w-4" />}
        />
      </section>

      <div key={days} aria-busy="false" className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <AdminDailyTrendChart stats={overview.dailyStats} days={days} />
        <AdminDashboardCharts overview={overview} days={days} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminModuleBarChart stats={overview.moduleStats} days={days} />
        <section aria-label="异常入口" className="flex flex-col gap-3">
          {exceptionEntries.map((entry) => (
          <Link
            key={entry.label}
            href={entry.href}
            aria-label={`查看 ${entry.label}（${formatNumberPrimitive(entry.value)}）`}
            className={`group flex min-w-0 items-center gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3 motion-safe:transition-colors hover:bg-[var(--admin-surface-soft)] ${exceptionSurfaceHover[entry.tone]}`}
          >
            <span
              aria-hidden="true"
              className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${exceptionToneClass[entry.tone]}`}
            >
              {entry.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">
                {entry.label}
              </span>
              <span
                className="mt-1 block text-xl font-black tabular-nums leading-none"
                style={{ color: adminToneColor(entry.tone === "good" ? "good" : entry.tone === "warning" ? "warning" : entry.tone === "info" ? "neutral" : "danger") }}
              >
                {formatNumberPrimitive(entry.value)}
              </span>
            </span>
            <ArrowUpRight
              aria-hidden="true"
              className="h-4 w-4 shrink-0 text-[var(--admin-faint)] motion-safe:transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--admin-fg)]"
            />
          </Link>
          ))}
        </section>
      </div>

      <AdminSection
        title="最近任务"
        description="生成和工作流任务的最新进度 · 按模块轮换展示"
        actions={
          <Link
            href="/admin/generations"
            className="inline-flex items-center gap-1 text-xs font-black text-[var(--admin-link)] hover:text-[var(--admin-fg)]"
          >
            进入任务中心
            <ArrowUpRight aria-hidden="true" className="h-3 w-3" />
          </Link>
        }
      >
        <AdminTable<AdminTaskListItem>
          rows={overview.recentTasks}
          columns={recentTaskColumns}
          rowKey={(row) => row.id}
          empty={
            <EmptyState
              title="暂无最近任务"
              description="近 24 小时内没有新的生成或工作流任务记录。"
            />
          }
        />
      </AdminSection>
    </div>
  );
}

type KpiDelta = { value: number; hint: string } | undefined;

function computeKpiDeltas(stats: AdminOverview["dailyStats"]) {
  const tasks = stats.map((row) => row.tasks);
  const failureRate = stats.map((row) => (row.tasks > 0 ? (row.failed / row.tasks) * 100 : 0));
  const successRate = stats.map((row) => (row.tasks > 0 ? ((row.tasks - row.failed) / row.tasks) * 100 : 0));
  return {
    tasks: deltaFor(tasks, "positiveIsGood"),
    successRate: deltaFor(successRate, "positiveIsGood"),
    failureRate: deltaFor(failureRate, "positiveIsBad"),
  };
}

function deltaFor(values: number[], direction: "positiveIsGood" | "positiveIsBad"): KpiDelta {
  if (values.length < 2) return undefined;
  const latest = values[values.length - 1];
  const prior = values.slice(0, -1);
  const priorAvg = prior.reduce((sum, value) => sum + value, 0) / prior.length;
  if (!Number.isFinite(priorAvg) || priorAvg === 0) {
    if (latest === 0) return { value: 0, hint: "vs 此前平均" };
    return { value: latest > 0 ? 100 : -100, hint: "vs 此前平均" };
  }
  const raw = ((latest - priorAvg) / Math.abs(priorAvg)) * 100;
  const signed = direction === "positiveIsBad" ? -raw : raw;
  return { value: Math.round(signed * 10) / 10, hint: "vs 此前平均" };
}
