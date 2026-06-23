import Link from "next/link";
import { Coins, Search } from "lucide-react";
import { AdminCreditAdjustForm } from "@/components/admin/AdminCreditAdjustForm";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  formatDateTime,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { listAdminCreditLogs, type AdminCreditLogItem } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminCreditsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const credits = await listAdminCreditLogs({ q, limit: q ? 100 : 60 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Credits"
        title="灵点管理"
        description="查看灵点流水、扣费和补偿记录；人工调整必须选择用户并填写原因，系统会自动保存审计记录。"
      />

      {credits.warnings.length > 0 && <AdminNotice>灵点数据源提示：{credits.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetricCard label="当前页消耗" value={formatNumber(credits.metrics.debits)} hint="amount < 0" />
        <AdminMetricCard label="当前页入账" value={formatNumber(credits.metrics.credits)} hint="amount > 0" />
        <AdminMetricCard label="净变化" value={formatNumber(credits.metrics.net)} tone={credits.metrics.net < 0 ? "warning" : "good"} />
        <AdminMetricCard label="影响用户" value={formatNumber(credits.metrics.affectedUsers)} />
      </div>

      <AdminSection
        title="人工调整"
        description="适合财务或负责人直接处理已核实的问题，例如补发灵点、扣回误发灵点。"
      >
        <AdminCreditAdjustForm />
      </AdminSection>

      <AdminSection
        title="补偿审批申请"
        description="适合运营先提交申请；财务或负责人在审批中心确认后才会生效。"
      >
        <AdminCreditAdjustForm mode="request" />
      </AdminSection>

      <AdminSection
        title="灵点流水"
        description="来自 credit_logs，按时间倒序。"
        actions={
          <form action="/admin/credits" className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--admin-faint)]" />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索邮箱 / 原因 / 任务"
                className="h-9 w-64 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] pl-8 pr-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
              />
            </div>
            <button className="h-9 rounded-lg bg-[var(--admin-fg)] px-3 text-xs font-black text-white" type="submit">
              搜索
            </button>
          </form>
        }
      >
        <AdminTable<AdminCreditLogItem>
          rows={credits.rows}
          rowKey={(row) => row.id}
          empty="暂无灵点流水"
          columns={[
            {
              key: "amount",
              label: "变动",
              render: (row) => (
                <span className={`inline-flex items-center gap-1 font-mono text-sm font-black ${row.amount >= 0 ? "text-[var(--admin-success)]" : "text-[var(--admin-danger)]"}`}>
                  <Coins className="h-3.5 w-3.5" />
                  {row.amount > 0 ? "+" : ""}{formatNumber(row.amount)}
                </span>
              ),
            },
            { key: "balance", label: "余额", render: (row) => <span className="font-mono text-sm font-bold text-[var(--admin-fg)]">{formatNumber(row.balance)}</span> },
            {
              key: "user",
              label: "用户",
              render: (row) => (
                <div className="min-w-[240px]">
                  <p className="truncate text-sm font-bold text-[var(--admin-fg)]">{row.email || "-"}</p>
                </div>
              ),
            },
            { key: "reason", label: "原因", render: (row) => <span className="text-sm font-semibold text-[var(--admin-fg)]">{row.reason}</span> },
            { key: "generation", label: "关联任务", render: (row) => row.generationId ? <Link href={`/admin/generations/${row.generationId}`} className="text-xs font-bold text-[var(--admin-fg)] hover:underline">查看任务</Link> : <span className="text-xs text-[var(--admin-faint)]">-</span> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.createdAt)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
