import { BarChart3, CalendarDays, TrendingUp } from "lucide-react";
import type { ReactNode } from "react";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import {
  getAdminCostReport,
  type AdminCostBreakdownItem,
  type AdminCostDailyItem,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const dayOptions = [7, 14, 30, 90];

export default async function AdminReportsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const days = normalizeDays(getSearchParam(params.days));
  const report = await getAdminCostReport({ days });
  const fulfillmentCredits = report.metrics.generationSettledCredits + report.metrics.workflowSettledCredits;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Reports"
        title="成本利润报表"
        description="按积分流水、生成任务和 Agent 工作流汇总收入代理、退款、履约成本、毛利代理和失败损耗。真实 provider 账单接入前，先提供可运营的财务口径和异常定位入口。"
        actions={
          <form action="/admin/reports" className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-slate-400" />
            <select
              name="days"
              defaultValue={String(report.days)}
              className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700"
            >
              {dayOptions.map((item) => (
                <option key={item} value={item}>近 {item} 天</option>
              ))}
            </select>
            <button type="submit" className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white">
              应用
            </button>
          </form>
        }
      />

      {report.warnings.length > 0 && (
        <AdminNotice>报表数据源提示：{report.warnings.slice(0, 3).join("；")}</AdminNotice>
      )}
      <AdminNotice tone="info">
        {report.assumptions.join(" ")}
      </AdminNotice>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AdminMetricCard label="扣费收入" value={formatCredits(report.metrics.grossCredits)} hint="credit_logs amount < 0" />
        <AdminMetricCard label="生成退款" value={formatCredits(report.metrics.refundCredits)} hint="带 generation_id 的正向流水" tone={report.metrics.refundCredits > 0 ? "warning" : "good"} />
        <AdminMetricCard label="净收入" value={formatCredits(report.metrics.netCredits)} hint="扣费 - 退款" tone="good" />
        <AdminMetricCard label="履约成本" value={formatCredits(fulfillmentCredits)} hint="generation + workflow 结算积分" />
        <AdminMetricCard label="毛利代理" value={formatSignedCredits(report.metrics.marginCredits)} hint={`${formatPercent(report.metrics.marginRate)} 毛利率`} tone={report.metrics.marginCredits < 0 ? "danger" : "neutral"} />
        <AdminMetricCard label="失败锁定" value={formatCredits(report.metrics.failedReservedCredits)} hint={`${formatNumber(report.metrics.failedCount)} 个失败任务`} tone={report.metrics.failedReservedCredits > 0 ? "warning" : "good"} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(420px,0.85fr)]">
        <BreakdownSection title="模块利润" rows={report.modules} />
        <AdminSection
          title="整体状态"
          description="用于判断收入、履约和失败损耗是否同步变化。"
        >
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <StatusTile label="生成任务" value={report.metrics.generationCount} icon={<BarChart3 className="h-4 w-4" />} />
            <StatusTile label="Agent 工作流" value={report.metrics.workflowCount} icon={<TrendingUp className="h-4 w-4" />} />
            <StatusTile label="完成" value={report.metrics.completedCount} tone="good" />
            <StatusTile label="进行中" value={report.metrics.runningCount} tone="warning" />
            <StatusTile label="生成预扣" value={report.metrics.generationReservedCredits} />
            <StatusTile label="进行中锁定" value={report.metrics.inFlightCredits} tone="warning" />
            <StatusTile label="工作流预占" value={report.metrics.workflowReservedCredits} />
            <StatusTile label="正向调整" value={report.metrics.adjustmentCredits} tone="good" />
          </div>
        </AdminSection>
      </div>

      <BreakdownSection title="模型利润" rows={report.models} />

      <AdminSection title="每日趋势" description="按 UTC 日期聚合，方便与日志和 provider 后台对账。">
        <AdminTable<AdminCostDailyItem>
          rows={report.daily}
          rowKey={(row) => row.date}
          empty="暂无日报样本"
          columns={[
            { key: "date", label: "日期", render: (row) => <span className="font-mono text-xs font-black text-slate-700">{row.date}</span> },
            { key: "gross", label: "扣费", render: (row) => <CreditValue value={row.grossCredits} /> },
            { key: "refund", label: "退款", render: (row) => <CreditValue value={row.refundCredits} tone="warning" /> },
            { key: "settled", label: "履约", render: (row) => <CreditValue value={row.generationSettledCredits + row.workflowSettledCredits} /> },
            { key: "margin", label: "毛利代理", render: (row) => <CreditValue value={row.marginCredits} signed tone={row.marginCredits < 0 ? "danger" : "neutral"} /> },
            { key: "tasks", label: "任务", render: (row) => <span className="font-mono text-sm font-black text-slate-700">{formatNumber(row.tasks)}</span> },
            { key: "failed", label: "失败", render: (row) => <span className="font-mono text-sm font-bold text-red-700">{formatNumber(row.failed)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function BreakdownSection({ title, rows }: { title: string; rows: AdminCostBreakdownItem[] }) {
  return (
    <AdminSection title={title} description="按净收入积分排序，只展示前 12 项。">
      <AdminTable<AdminCostBreakdownItem>
        rows={rows}
        rowKey={(row) => row.key}
        empty="暂无报表样本"
        columns={[
          {
            key: "name",
            label: "名称",
            render: (row) => (
              <div className="min-w-[180px]">
                <p className="text-sm font-black text-slate-950">{row.label}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-400">{row.key}</p>
              </div>
            ),
          },
          { key: "count", label: "任务", render: (row) => <span className="font-mono text-sm font-black text-slate-700">{formatNumber(row.count)}</span> },
          { key: "net", label: "净收入", render: (row) => <CreditValue value={row.netCredits} /> },
          { key: "settled", label: "履约", render: (row) => <CreditValue value={row.settledCredits} /> },
          { key: "refund", label: "退款", render: (row) => <CreditValue value={row.refundCredits} tone="warning" /> },
          { key: "margin", label: "毛利代理", render: (row) => <CreditValue value={row.marginCredits} signed tone={row.marginCredits < 0 ? "danger" : "neutral"} /> },
          { key: "avg", label: "均值", render: (row) => <span className="font-mono text-xs font-bold text-slate-600">{formatCredits(row.averageCredits)}</span> },
          { key: "failed", label: "失败率", render: (row) => <span className="font-mono text-xs font-bold text-red-700">{formatPercent(row.failureRate)}</span> },
        ]}
      />
    </AdminSection>
  );
}

function StatusTile({
  label,
  value,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: number;
  tone?: "neutral" | "good" | "warning";
  icon?: ReactNode;
}) {
  const toneClass = {
    neutral: "border-slate-200 bg-white text-slate-800",
    good: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-amber-200 bg-amber-50 text-amber-800",
  }[tone];
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black">{label}</p>
        {icon}
      </div>
      <p className="mt-2 font-mono text-xl font-black tabular-nums">{formatCredits(value)}</p>
    </div>
  );
}

function CreditValue({
  value,
  signed,
  tone = "neutral",
}: {
  value: number;
  signed?: boolean;
  tone?: "neutral" | "warning" | "danger";
}) {
  const toneClass = tone === "danger" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-slate-700";
  return (
    <span className={`font-mono text-sm font-black ${toneClass}`}>
      {signed ? formatSignedCredits(value) : formatCredits(value)}
    </span>
  );
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

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function normalizeDays(value: string) {
  const parsed = Number(value);
  return dayOptions.includes(parsed) ? parsed : 14;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
