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
  const credits = await listAdminCreditLogs({ q, limit: 100 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Credits"
        title="积分管理"
        description="查看积分流水、扣费/退款趋势，并通过受控 RPC 做人工调整。所有调整都会写入 credit_logs 和 admin_audit_logs。"
      />

      {credits.warnings.length > 0 && <AdminNotice>积分数据源提示：{credits.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetricCard label="当前页消耗" value={formatNumber(credits.metrics.debits)} hint="amount < 0" />
        <AdminMetricCard label="当前页入账" value={formatNumber(credits.metrics.credits)} hint="amount > 0" />
        <AdminMetricCard label="净变化" value={formatNumber(credits.metrics.net)} tone={credits.metrics.net < 0 ? "warning" : "good"} />
        <AdminMetricCard label="影响用户" value={formatNumber(credits.metrics.affectedUsers)} />
      </div>

      <AdminSection
        title="人工调整"
        description="Finance/Owner 可直接执行。需要先执行 supabase/admin-console.sql 中的 admin_adjust_user_credits RPC。"
      >
        <AdminCreditAdjustForm />
      </AdminSection>

      <AdminSection
        title="补偿审批申请"
        description="Support/Ops 可创建审批单；Finance/Owner 在审批中心通过后才会真正调用积分 RPC。"
      >
        <AdminCreditAdjustForm mode="request" />
      </AdminSection>

      <AdminSection
        title="积分流水"
        description="来自 credit_logs，按时间倒序。"
        actions={
          <form action="/admin/credits" className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索用户 / 原因 / 生成 ID"
                className="h-9 w-64 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm font-semibold outline-none focus:border-slate-400"
              />
            </div>
            <button className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white" type="submit">
              搜索
            </button>
          </form>
        }
      >
        <AdminTable<AdminCreditLogItem>
          rows={credits.rows}
          rowKey={(row) => row.id}
          empty="暂无积分流水"
          columns={[
            {
              key: "amount",
              label: "变动",
              render: (row) => (
                <span className={`inline-flex items-center gap-1 font-mono text-sm font-black ${row.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                  <Coins className="h-3.5 w-3.5" />
                  {row.amount > 0 ? "+" : ""}{formatNumber(row.amount)}
                </span>
              ),
            },
            { key: "balance", label: "余额", render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{formatNumber(row.balance)}</span> },
            {
              key: "user",
              label: "用户",
              render: (row) => (
                <div className="min-w-[240px]">
                  <p className="truncate text-sm font-bold text-slate-800">{row.email || "-"}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.userId}</p>
                </div>
              ),
            },
            { key: "reason", label: "原因", render: (row) => <span className="text-sm font-semibold text-slate-700">{row.reason}</span> },
            { key: "generation", label: "生成", render: (row) => <code className="text-xs text-slate-500">{row.generationId || "-"}</code> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
