"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import {
  Alert,
  Button,
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
import type { AdminCostReport, AdminOverview, AdminTaskListItem } from "@/lib/admin/data";

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
  const failureRate = overview.generationHealth.failureRate;
  const fulfillmentCredits = report.metrics.generationSettledCredits + report.metrics.workflowSettledCredits;

  return (
    <Space orientation="vertical" size={16} className="w-full">
      <div className="admin-page-hero">
        <div>
          <Typography.Text className="admin-page-eyebrow">Console</Typography.Text>
          <Typography.Title level={2} className="!mb-1 !mt-1">
            运营总览
          </Typography.Title>
          <Typography.Paragraph className="!mb-0 !text-slate-500">
            生成任务、收入灵点、模型成本、队列健康和异常处理统一看板。
          </Typography.Paragraph>
        </div>
        <Space wrap>
          <Segmented
            value={days}
            options={dayOptions}
            onChange={(value) => {
              window.location.href = value === 7 ? "/admin" : `/admin?days=${value}`;
            }}
          />
          <Link href="/admin">
            <Button icon={<ReloadOutlined aria-hidden="true" />}>刷新</Button>
          </Link>
        </Space>
      </div>

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
          <Card title="最近任务" extra={<Link href="/admin/generations">进入任务中心</Link>}>
            <Table<AdminTaskListItem>
              size="small"
              rowKey="id"
              columns={taskColumns}
              dataSource={overview.recentTasks}
              pagination={false}
              scroll={{ x: 920 }}
              locale={{ emptyText: "暂无最近任务" }}
            />
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          <Card title="异常入口">
            <List
              dataSource={[
                { label: "失败任务", value: overview.taskHealth.failed, href: "/admin/generations?status=failed", tone: "red" },
                { label: "排队任务", value: overview.taskHealth.queued, href: "/admin/generations?status=queued", tone: "orange" },
                { label: "运行任务", value: overview.taskHealth.running, href: "/admin/generations?status=running", tone: "blue" },
                { label: "失败锁定灵点", value: report.metrics.failedReservedCredits, href: "/admin/reports", tone: "volcano" },
              ]}
              renderItem={(item) => (
                <List.Item actions={[<Link key="open" href={item.href}>查看</Link>]}>
                  <List.Item.Meta
                    avatar={<Tag color={item.tone}>{formatNumber(item.value)}</Tag>}
                    title={item.label}
                    description="点击进入已保留筛选条件的处理队列"
                  />
                </List.Item>
              )}
            />
          </Card>
        </Col>
      </Row>

      <LazyDashboardCharts overview={overview} report={report} days={days} />
    </Space>
  );
}

function DashboardChartsSkeleton() {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={index} title="图表加载中">
          <div className="h-[300px] rounded-md bg-slate-100" />
        </Card>
      ))}
    </div>
  );
}

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
  const color = tone === "good" ? "#16a34a" : tone === "warning" ? "#d97706" : tone === "danger" ? "#dc2626" : "#0f172a";
  return (
    <Col xs={24} sm={12} xl={4}>
      <Card className="admin-kpi-card">
        <Space align="start" className="w-full justify-between">
          <Statistic title={title} value={value} precision={precision} styles={{ content: { color } }} />
          <span className="admin-kpi-icon">{icon}</span>
        </Space>
        {suffix && <Typography.Text type="secondary">{suffix}</Typography.Text>}
      </Card>
    </Col>
  );
}

const taskColumns: ColumnsType<AdminTaskListItem> = [
  {
    title: "任务",
    dataIndex: "title",
    width: 260,
    render: (_, row) => (
      <Space orientation="vertical" size={0}>
        <Space size={6}>
          <StatusTag status={row.statusGroup} label={row.status} />
          <Typography.Text type="secondary">{row.sourceType}</Typography.Text>
        </Space>
        <Link href={`/admin/generations/${row.sourceId}`} className="font-semibold">
          {row.title}
        </Link>
        <Typography.Text type="secondary" className="text-xs">
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
    render: (value: string | null) => formatDate(value),
  },
];

function StatusTag({ status, label }: { status: string; label: string }) {
  const color = status === "completed" ? "green" : status === "failed" ? "red" : status === "running" ? "blue" : "orange";
  return <Tag color={color}>{label}</Tag>;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(value * 10) / 10);
}

function formatDate(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
