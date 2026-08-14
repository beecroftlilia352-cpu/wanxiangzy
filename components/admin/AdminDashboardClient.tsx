"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Coins,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Segmented } from "@/components/ui/shadcn-compat";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  AdminPageHeader,
  AdminSection,
  AdminMetricCard,
  AdminTable,
  AdminStatusBadge,
  adminToneColor,
  formatDateTime,
  formatNumber as formatNumberPrimitive,
} from "@/components/admin/AdminPrimitives";
import { AdminDashboardCharts } from "@/components/admin/AdminDashboardCharts";
import type { AdminOverview, AdminTaskListItem } from "@/lib/admin/data";
import type { TaskStatusGroup } from "@/lib/task-queue";

type AdminDashboardClientProps = {
  overview: AdminOverview;
  days: number;
  fetchError?: string | null;
};

const dayOptions = [
  { label: "今天", value: 1 },
  { label: "近 7 天", value: 7 },
  { label: "近 14 天", value: 14 },
  { label: "近 30 天", value: 30 },
];

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
  const router = useRouter();
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
      <AdminPageHeader
        eyebrow="运营总览"
        title="运营总览"
        description="生成任务、灵点流水与队列健康统一看板。"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <span id="dashboard-days-help" className="sr-only">
              改变下方所有图表和 KPI 趋势线的时间窗口
            </span>
            <Segmented
              value={days}
              options={dayOptions}
              onChange={(value) => {
                const href = value === 7 ? "/admin" : `/admin?days=${value}`;
                router.push(href);
              }}
              aria-label="选择时间窗口"
              aria-describedby="dashboard-days-help"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.push(`/admin?days=${days}`)}
              aria-label="刷新运营总览"
            >
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              刷新
            </Button>
          </div>
        }
      />

      {overview.warnings.length > 0 && (
        <ErrorState
          title="部分数据源暂不可用"
          description={overview.warnings.slice(0, 3).join("；")}
        />
      )}

      <section aria-label="关键指标" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AdminMetricCard
          label="生成任务"
          value={formatNumberPrimitive(overview.generationHealth.total)}
          hint={`今日 ${formatNumberPrimitive(overview.generationHealth.today)}`}
          icon={<Sparkles aria-hidden="true" className="h-4 w-4" />}
        />
        <AdminMetricCard
          label="成功率"
          value={formatNumberPrimitive(100 - failureRate)}
          suffix="%"
          tone={failureRate > 20 ? "danger" : "good"}
          icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
        />
        <AdminMetricCard
          label="失败率"
          value={formatNumberPrimitive(failureRate)}
          suffix="%"
          tone={failureRate > 15 ? "danger" : failureRate > 5 ? "warning" : "good"}
          icon={<AlertTriangle aria-hidden="true" className="h-4 w-4" />}
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

      <section aria-label="异常入口" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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

      <div key={days} aria-busy="false">
        <AdminDashboardCharts overview={overview} days={days} />
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
