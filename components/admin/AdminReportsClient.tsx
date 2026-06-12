"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { Alert, Card, Select, Space, Statistic, Table, Tag, Typography, type ColumnsType } from "@/components/ui/shadcn-compat";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AdminCostBreakdownItem, AdminCostDailyItem, AdminCostReport } from "@/lib/admin/data";

type AdminReportsClientProps = {
  report: AdminCostReport;
};

const dayOptions = [
  { value: 7, label: "近 7 天" },
  { value: 14, label: "近 14 天" },
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
];

const reportTrendConfig = {
  grossCredits: { label: "扣费", color: "hsl(var(--chart-1))" },
  refundCredits: { label: "退款", color: "hsl(var(--chart-4))" },
  settledCredits: { label: "履约", color: "hsl(var(--chart-3))" },
  marginCredits: { label: "毛利代理", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

const moduleMarginConfig = {
  value: { label: "毛利代理", color: "hsl(var(--chart-2))" },
} satisfies ChartConfig;

export function AdminReportsClient({ report }: AdminReportsClientProps) {
  const fulfillmentCredits = report.metrics.generationSettledCredits + report.metrics.workflowSettledCredits;
  const trendData = report.daily.map((row) => ({
    date: row.date,
    grossCredits: row.grossCredits,
    refundCredits: row.refundCredits,
    settledCredits: row.generationSettledCredits + row.workflowSettledCredits,
    marginCredits: row.marginCredits,
  }));
  const moduleChart = report.modules.slice(0, 10).map((row) => ({
    label: row.label,
    value: Math.round(row.marginCredits * 10) / 10,
  }));

  return (
    <Space orientation="vertical" size={16} className="w-full">
      <div className="admin-page-hero">
        <div>
          <Typography.Text className="admin-page-eyebrow">Reports</Typography.Text>
          <Typography.Title level={2} className="!mb-1 !mt-1">成本利润报表</Typography.Title>
          <Typography.Paragraph className="!mb-0 !text-slate-500">
            按灵点流水、生成任务和 Agent 工作流汇总收入代理、退款、履约成本、毛利代理和失败损耗。
          </Typography.Paragraph>
        </div>
        <form action="/admin/reports">
          <Select
            className="!w-32"
            defaultValue={report.days}
            options={dayOptions}
            onChange={(value) => {
              window.location.href = `/admin/reports?days=${value}`;
            }}
          />
        </form>
      </div>

      {report.warnings.length > 0 && <Alert type="warning" showIcon message="报表数据源提示" description={report.warnings.slice(0, 3).join("；")} />}
      <Alert type="info" showIcon message="口径说明" description={report.assumptions.join(" ")} />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric title="扣费收入" value={report.metrics.grossCredits} />
        <Metric title="生成退款" value={report.metrics.refundCredits} tone={report.metrics.refundCredits > 0 ? "warning" : "good"} />
        <Metric title="净收入" value={report.metrics.netCredits} tone="good" />
        <Metric title="履约成本" value={fulfillmentCredits} />
        <Metric title="毛利代理" value={report.metrics.marginCredits} tone={report.metrics.marginCredits < 0 ? "danger" : "neutral"} suffix={`${formatPercent(report.metrics.marginRate)} 毛利率`} />
        <Metric title="失败锁定" value={report.metrics.failedReservedCredits} tone={report.metrics.failedReservedCredits > 0 ? "warning" : "good"} suffix={`${formatNumber(report.metrics.failedCount)} 个失败任务`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Card title="每日趋势">
          <ChartContainer config={reportTrendConfig} className="h-[320px] w-full">
            <LineChart accessibilityLayer data={trendData} margin={{ left: 8, right: 16, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} width={42} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line type="monotone" dataKey="grossCredits" stroke="var(--color-grossCredits)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="refundCredits" stroke="var(--color-refundCredits)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="settledCredits" stroke="var(--color-settledCredits)" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="marginCredits" stroke="var(--color-marginCredits)" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartContainer>
        </Card>
        <Card title="模块毛利代理 Top 10">
          <ChartContainer config={moduleMarginConfig} className="h-[320px] w-full">
            <BarChart accessibilityLayer data={moduleChart} margin={{ left: 8, right: 16 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} width={42} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" fill="var(--color-value)" radius={4} />
            </BarChart>
          </ChartContainer>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownTable title="模块利润" rows={report.modules} />
        <BreakdownTable title="模型利润" rows={report.models} />
      </div>

      <Card title="每日明细">
        <Table<AdminCostDailyItem>
          size="small"
          rowKey="date"
          dataSource={report.daily}
          columns={dailyColumns}
          scroll={{ x: 900 }}
          pagination={false}
          locale={{ emptyText: "暂无日报样本" }}
        />
      </Card>
    </Space>
  );
}

function Metric({ title, value, tone = "neutral", suffix }: { title: string; value: number; tone?: "neutral" | "good" | "warning" | "danger"; suffix?: string }) {
  const color = tone === "good" ? "#16a34a" : tone === "warning" ? "#d97706" : tone === "danger" ? "#dc2626" : "#0f172a";
  return (
    <Card>
      <Statistic title={title} value={Math.round(value * 10) / 10} styles={{ content: { color } }} />
      {suffix && <Typography.Text type="secondary">{suffix}</Typography.Text>}
    </Card>
  );
}

function BreakdownTable({ title, rows }: { title: string; rows: AdminCostBreakdownItem[] }) {
  return (
    <Card title={title}>
      <Table<AdminCostBreakdownItem>
        size="small"
        rowKey="key"
        dataSource={rows}
        columns={breakdownColumns}
        scroll={{ x: 760 }}
        pagination={false}
        locale={{ emptyText: "暂无报表样本" }}
      />
    </Card>
  );
}

const breakdownColumns: ColumnsType<AdminCostBreakdownItem> = [
  {
    title: "名称",
    dataIndex: "label",
    width: 190,
    render: (_, row) => (
      <Space orientation="vertical" size={0}>
        <Typography.Text strong>{row.label}</Typography.Text>
        <Typography.Text type="secondary" className="font-mono text-xs">{row.key}</Typography.Text>
      </Space>
    ),
  },
  { title: "任务", dataIndex: "count", width: 80, sorter: (a, b) => a.count - b.count, render: formatNumber },
  { title: "净收入", dataIndex: "netCredits", width: 100, sorter: (a, b) => a.netCredits - b.netCredits, render: creditValue },
  { title: "履约", dataIndex: "settledCredits", width: 100, render: creditValue },
  { title: "退款", dataIndex: "refundCredits", width: 100, render: (value) => <Tag color={value > 0 ? "orange" : "default"}>{formatCredits(value)}</Tag> },
  { title: "毛利", dataIndex: "marginCredits", width: 100, sorter: (a, b) => a.marginCredits - b.marginCredits, render: (value) => <Tag color={value < 0 ? "red" : "green"}>{formatSignedCredits(value)}</Tag> },
  { title: "失败率", dataIndex: "failureRate", width: 90, render: formatPercent },
];

const dailyColumns: ColumnsType<AdminCostDailyItem> = [
  { title: "日期", dataIndex: "date", width: 120 },
  { title: "扣费", dataIndex: "grossCredits", width: 100, render: creditValue },
  { title: "退款", dataIndex: "refundCredits", width: 100, render: (value) => <Tag color={value > 0 ? "orange" : "default"}>{formatCredits(value)}</Tag> },
  { title: "履约", width: 100, render: (_, row) => creditValue(row.generationSettledCredits + row.workflowSettledCredits) },
  { title: "毛利代理", dataIndex: "marginCredits", width: 110, render: (value) => <Tag color={value < 0 ? "red" : "green"}>{formatSignedCredits(value)}</Tag> },
  { title: "任务", dataIndex: "tasks", width: 80, render: formatNumber },
  { title: "失败", dataIndex: "failed", width: 80, render: (value) => <Tag color={value > 0 ? "red" : "default"}>{formatNumber(value)}</Tag> },
];

function creditValue(value: number) {
  return <Typography.Text className="font-mono">{formatCredits(value)}</Typography.Text>;
}

function formatCredits(value: number) {
  return formatNumber(Math.round(value * 10) / 10);
}

function formatSignedCredits(value: number) {
  const formatted = formatCredits(Math.abs(value));
  if (value > 0) return `+${formatted}`;
  if (value < 0) return `-${formatted}`;
  return formatted;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}
