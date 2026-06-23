"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import dynamic from "next/dynamic";
import {
  Alert,
  Card,
  Col,
  List,
  Progress,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
  type ColumnsType,
} from "@/components/ui/shadcn-compat";
import {
  AlertOutlined,
  BarChartOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  FireOutlined,
  ReloadOutlined,
} from "@/components/ui/ant-icons-compat";
import {
  AdminPageHeader,
  AdminStatusBadge,
  adminToneColor,
  formatDateTime,
  formatNumber as formatNumberPrimitive,
} from "@/components/admin/AdminPrimitives";
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

const LazyDashboardCharts = dynamic(
  () => import("@/components/admin/AdminDashboardCharts").then((mod) => mod.AdminDashboardCharts),
  { loading: DashboardChartsSkeleton },
);

export function AdminDashboardClient({ overview, report, days }: AdminDashboardClientProps) {
  const router = useRouter();
  const failureRate = overview.generationHealth.failureRate;
  const fulfillmentCredits = report.metrics.generationSettledCredits + report.metrics.workflowSettledCredits;

  const taskColumns = useMemo<ColumnsType<AdminTaskListItem>>(() => [
    {
      title: "任务",
      dataIndex: "title",
      width: 260,
      render: (_, row) => (
        <Space orientation="vertical" size={0} className="min-w-0">
          <Space size={6} wrap>
            <AdminStatusBadge status={row.status} group={(row.statusGroup as TaskStatusGroup | undefined) ?? undefined} />
            <Typography.Text type="secondary">{row.sourceType}</Typography.Text>
          </Space>
          <Link href={`/admin/generations/${row.sourceId}`} className="font-semibold text-[var(--admin-fg)] hover:text-[var(--admin-fg)]">
            {row.title}
          </Link>
          <Typography.Text type="secondary" className="block truncate text-xs">
            任务编号 {row.sourceId.slice(0, 8)}
          </Typography.Text>
        </Space>
      ),
    },
    { title: "模块", dataIndex: "moduleLabel", width: 120 },
    {
      title: "进度",
      dataIndex: "progress",
      width: 130,
      render: (value: number) => <Progress percent={value} size="small" />,
    },
    {
      title: "时间",
      dataIndex: "createdAt",
      width: 140,
      render: (value: string | null) => formatDateTime(value),
    },
  ], []);

  return (
    <Space orientation="vertical" size={16} className="w-full">
      <AdminPageHeader
        eyebrow="Console"
        title="运营总览"
        description="生成任务、收入灵点、模型成本、队列健康和异常处理统一看板。"
        actions={
          <Space wrap>
            <Segmented
              value={days}
              options={dayOptions}
              onChange={(value) => {
                const href = value === 7 ? "/admin" : `/admin?days=${value}`;
                router.push(href);
              }}
              aria-label="选择时间窗口"
            />
            <Link
              href="/admin"
              className="inline-flex h-9 items-center gap-2 rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold text-[var(--admin-fg)] shadow-sm transition-colors hover:border-[var(--admin-border-strong)] hover:text-[var(--admin-fg)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--admin-fg)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--admin-bg)]"
              aria-label="刷新运营总览"
            >
              <ReloadOutlined aria-hidden="true" />
              刷新
            </Link>
          </Space>
        }
      />

      {overview.warnings.length > 0 && (
        <Alert type="warning" showIcon message="部分数据源暂不可用" description={overview.warnings.slice(0, 3).join("；")} />
      )}
      {report.warnings.length > 0 && (
        <Alert type="info" showIcon message="报表数据源提示" description={report.warnings.slice(0, 3).join("；")} />
      )}

      <Row gutter={[12, 12]}>
        <KpiCard title="生成任务" value={overview.generationHealth.total} suffix={`今日 ${overview.generationHealth.today}`} icon={<BarChartOutlined aria-hidden="true" />} />
        <KpiCard title="成功率" value={100 - failureRate} precision={1} suffix="%" tone={failureRate > 20 ? "danger" : "good"} icon={<CheckCircleOutlined aria-hidden="true" />} />
        <KpiCard title="失败率" value={failureRate} precision={1} suffix="%" tone={failureRate > 15 ? "danger" : failureRate > 5 ? "warning" : "good"} icon={<AlertOutlined aria-hidden="true" />} />
        <KpiCard title="净收入灵点" value={report.metrics.netCredits} tone="good" icon={<DollarOutlined aria-hidden="true" />} />
        <KpiCard title="退款补偿" value={report.metrics.refundCredits} tone={report.metrics.refundCredits > 0 ? "warning" : "neutral"} icon={<FireOutlined aria-hidden="true" />} />
        <KpiCard title="履约成本" value={fulfillmentCredits} icon={<ClockCircleOutlined aria-hidden="true" />} />
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} xl={16}>
          <Card title="最近任务" extra={<Link href="/admin/generations" className="text-sm font-semibold text-[var(--admin-fg)] hover:text-[var(--admin-fg)]">进入任务中心</Link>}>
            <Table<AdminTaskListItem>
              size="small"
              rowKey="id"
              columns={taskColumns}
              dataSource={overview.recentTasks}
              pagination={false}
              locale={{ emptyText: "暂无最近任务" }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="异常入口">
            <List
              dataSource={[
                { label: "失败任务", value: overview.taskHealth.failed, href: "/admin/generations?status=failed", tone: "red" as const },
                { label: "排队任务", value: overview.taskHealth.queued, href: "/admin/generations?status=queued", tone: "orange" as const },
                { label: "运行任务", value: overview.taskHealth.running, href: "/admin/generations?status=running", tone: "blue" as const },
                { label: "失败锁定灵点", value: report.metrics.failedReservedCredits, href: "/admin/reports", tone: "red" as const },
              ]}
              renderItem={(item) => (
                <List.Item actions={[<Link key="open" href={item.href} aria-label={`查看 ${item.label}`} className="text-sm font-semibold text-[var(--admin-fg)] hover:text-[var(--admin-fg)]">查看</Link>]}>
                  <List.Item.Meta
                    avatar={<Tag color={item.tone}>{formatNumberPrimitive(item.value)}</Tag>}
                    title={item.label}
                    description="点击进入已保留筛选条件的处理队列"
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <div key={days}>
        <LazyDashboardCharts overview={overview} report={report} days={days} />
      </div>
    </Space>
  );
}

/* ----------------------------------------------------------------------------
 * Structural chart skeleton — mirrors the 4-card layout of AdminDashboardCharts
 * so users see the real shape of what's loading, not 4 generic grey boxes.
 * -------------------------------------------------------------------------- */
function DashboardChartsSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2" aria-hidden="true">
      <Card title="每日趋势">
        <SkeletonBlock height={280} lines={[{ width: "92%", height: 8 }, { width: "78%", height: 8 }, { width: "65%", height: 8 }]} />
      </Card>
      <Card title="任务状态分布">
        <SkeletonBlock height={280} variant="circle-row" />
      </Card>
      <Card title="模块排行">
        <SkeletonBlock height={280} lines={Array.from({ length: 6 }, () => ({ width: `${50 + Math.floor(Math.random() * 40)}%`, height: 14 }))} />
      </Card>
      <Card title="模型毛利">
        <SkeletonBlock height={280} lines={Array.from({ length: 5 }, () => ({ width: `${40 + Math.floor(Math.random() * 50)}%`, height: 12 }))} />
      </Card>
    </div>
  );
}

function SkeletonBlock({ height, lines, variant }: { height: number; lines?: Array<{ width: string; height: number }>; variant?: "circle-row" }) {
  return (
    <div className="space-y-3 animate-pulse" style={{ minHeight: height }}>
      {variant === "circle-row"
        ? (
          <div className="flex items-center gap-6">
            <div className="h-32 w-32 rounded-full bg-[var(--admin-surface-soft)]" />
            <div className="flex-1 space-y-2">
              {[60, 75, 50, 90, 65].map((w, i) => (
                <div key={i} className="h-3 rounded-full bg-[var(--admin-surface-soft)]" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        )
        : (
          lines?.map((line, i) => (
            <div key={i} className="rounded-md bg-[var(--admin-surface-soft)]" style={{ width: line.width, height: line.height }} />
          ))
        )}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * KPI tile — tone is one of "neutral" | "good" | "warning" | "danger";
 * resolved through adminToneColor() so the value color inherits dark mode.
 * -------------------------------------------------------------------------- */
function KpiCard({
  title,
  value,
  suffix,
  precision,
  tone = "neutral",
  icon,
}: {
  title: string;
  value: number;
  suffix?: string;
  precision?: number;
  tone?: "neutral" | "good" | "warning" | "danger";
  icon: React.ReactNode;
}) {
  const color = adminToneColor(tone);
  return (
    <Col xs={24} sm={12} xl={4}>
      <Card className="admin-kpi-card">
        <Space align="start" className="w-full justify-between">
          <span className="tabular-nums">
            <Statistic title={title} value={value} precision={precision} styles={{ content: { color } }} />
          </span>
          <span className="admin-kpi-icon" aria-hidden="true">{icon}</span>
        </Space>
        {suffix && <Typography.Text type="secondary">{suffix}</Typography.Text>}
      </Card>
    </Col>
  );
}