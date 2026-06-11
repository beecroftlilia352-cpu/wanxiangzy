"use client";

import dynamic from "next/dynamic";
import { Alert, Card, Select, Space, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import type { AdminCostBreakdownItem, AdminCostDailyItem, AdminCostReport } from "@/lib/admin/data";

type AdminReportsClientProps = {
  report: AdminCostReport;
};

const Line = dynamic(() => import("@ant-design/charts").then((mod) => mod.Line), { ssr: false });
const Column = dynamic(() => import("@ant-design/charts").then((mod) => mod.Column), { ssr: false });

const dayOptions = [
  { value: 7, label: "近 7 天" },
  { value: 14, label: "近 14 天" },
  { value: 30, label: "近 30 天" },
  { value: 90, label: "近 90 天" },
];

export function AdminReportsClient({ report }: AdminReportsClientProps) {
  const fulfillmentCredits = report.metrics.generationSettledCredits + report.metrics.workflowSettledCredits;
  const trendData = report.daily.flatMap((row) => [
    { date: row.date, metric: "扣费", value: row.grossCredits },
    { date: row.date, metric: "退款", value: row.refundCredits },
    { date: row.date, metric: "履约", value: row.generationSettledCredits + row.workflowSettledCredits },
    { date: row.date, metric: "毛利代理", value: row.marginCredits },
  ]);
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
            按积分流水、生成任务和 Agent 工作流汇总收入代理、退款、履约成本、毛利代理和失败损耗。
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
          <Line height={320} data={trendData} xField="date" yField="value" colorField="metric" point smooth legend={{ color: { position: "bottom" } }} />
        </Card>
        <Card title="模块毛利代理 Top 10">
          <Column height={320} data={moduleChart} xField="label" yField="value" colorField="label" legend={false} />
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
