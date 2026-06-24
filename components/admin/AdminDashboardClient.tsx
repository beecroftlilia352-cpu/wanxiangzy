"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  Clock3,
  Flame,
  RefreshCw,
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
import type { AdminCostReport, AdminOverview, AdminTaskListItem } from "@/lib/admin/data";
import type { TaskStatusGroup } from "@/lib/task-queue";

type AdminDashboardClientProps = {
  overview: AdminOverview;
  report: AdminCostReport;
  days: number;
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

export function AdminDashboardClient({ overview, report, days }: AdminDashboardClientProps) {
  const router = useRouter();
  const failureRate = overview.generationHealth.failureRate;
  const fulfillmentCredits = report.metrics.generationSettledCredits + report.metrics.workflowSettledCredits;

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
      label: "失败锁定灵点",
      value: report.metrics.failedReservedCredits,
      href: "/admin/reports",
      tone: "danger",
      icon: <Flame aria-hidden="true" className="h-4 w-4" />,
    },
  ];

  const dailySeries = useMemo(() => buildDailySeries(report.daily), [report.daily]);

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
      <AdminPageHeader
        eyebrow="Console"
        title="运营总览"
        description="生成任务、收入灵点、模型成本、队列健康和异常处理统一看板。"
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
      {report.warnings.length > 0 && (
        <ErrorState
          title="报表数据源提示"
          description={report.warnings.slice(0, 3).join("；")}
        />
      )}

      <section aria-label="关键指标" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <AdminMetricCard
          label="生成任务"
          value={formatNumberPrimitive(overview.generationHealth.total)}
          hint={`今日 ${formatNumberPrimitive(overview.generationHealth.today)}`}
          trend={dailySeries.tasks}
        />
        <AdminMetricCard
          label="成功率"
          value={formatNumberPrimitive(100 - failureRate)}
          suffix="%"
          tone={failureRate > 20 ? "danger" : "good"}
          trend={dailySeries.successRate}
        />
        <AdminMetricCard
          label="失败率"
          value={formatNumberPrimitive(failureRate)}
          suffix="%"
          tone={failureRate > 15 ? "danger" : failureRate > 5 ? "warning" : "good"}
          trend={dailySeries.failureRate}
        />
        <AdminMetricCard
          label="净收入灵点"
          value={formatNumberPrimitive(report.metrics.netCredits)}
          tone="good"
          trend={dailySeries.marginCredits}
        />
        <AdminMetricCard
          label="退款补偿"
          value={formatNumberPrimitive(report.metrics.refundCredits)}
          tone={report.metrics.refundCredits > 0 ? "warning" : "neutral"}
          trend={dailySeries.refundCredits}
        />
        <AdminMetricCard
          label="履约成本"
          value={formatNumberPrimitive(fulfillmentCredits)}
          trend={dailySeries.settledCredits}
        />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
        <AdminSection
          title="最近任务"
          description="生成和工作流任务的最新进度"
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

        <AdminSection
          title="异常入口"
          description="点击进入已保留筛选条件的处理队列"
        >
          <ul className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-1">
            {exceptionEntries.map((entry) => (
              <li key={entry.label} className="min-w-0">
                <Link
                  href={entry.href}
                  aria-label={`查看 ${entry.label}`}
                  className={`group flex min-w-0 items-center gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3 transition-colors hover:bg-[var(--admin-surface-soft)] ${exceptionSurfaceHover[entry.tone]}`}
                >
                  <span
                    aria-hidden="true"
                    className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${exceptionToneClass[entry.tone]}`}
                  >
                    {entry.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">
                      {entry.label}
                    </span>
                    <span
                      className="mt-1 block text-lg font-black tabular-nums leading-none"
                      style={{ color: adminToneColor(entry.tone === "good" ? "good" : entry.tone === "warning" ? "warning" : entry.tone === "info" ? "neutral" : "danger") }}
                    >
                      {formatNumberPrimitive(entry.value)}
                    </span>
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-[var(--admin-faint)] transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--admin-fg)]"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </AdminSection>
      </div>

      <div key={days} aria-busy="false">
        <AdminDashboardCharts overview={overview} report={report} days={days} />
      </div>
    </div>
  );
}

type DailySeries = {
  tasks: number[];
  successRate: number[];
  failureRate: number[];
  marginCredits: number[];
  refundCredits: number[];
  settledCredits: number[];
};

function buildDailySeries(rows: AdminCostReport["daily"]): DailySeries {
  const tasks = rows.map((row) => row.tasks);
  const failureRate = rows.map((row) => (row.tasks > 0 ? (row.failed / row.tasks) * 100 : 0));
  const successRate = rows.map((row) => (row.tasks > 0 ? ((row.tasks - row.failed) / row.tasks) * 100 : 0));
  const marginCredits = rows.map((row) => row.marginCredits);
  const refundCredits = rows.map((row) => row.refundCredits);
  const settledCredits = rows.map((row) => row.generationSettledCredits + row.workflowSettledCredits);
  return { tasks, successRate, failureRate, marginCredits, refundCredits, settledCredits };
}
