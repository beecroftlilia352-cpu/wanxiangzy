import Link from "next/link";
import { Search, UserRoundCog } from "lucide-react";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  formatDateTime,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { listAdminUsers, type AdminUserListItem } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminUsersPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const users = await listAdminUsers({ q, limit: 50 });
  const totalCredits = users.rows.reduce((sum, row) => sum + row.credits, 0);
  const totalUsed = users.rows.reduce((sum, row) => sum + row.totalCreditsUsed, 0);
  const totalGenerations = users.rows.reduce((sum, row) => sum + row.generationCount, 0);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Users"
        title="用户管理"
        description="查看用户余额、积分消耗、生成活跃度和最近任务时间。写操作会在下一阶段接入二次确认与审计。"
        actions={
          <Link
            href="/admin/audit"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <UserRoundCog className="h-3.5 w-3.5" />
            查看审计
          </Link>
        }
      />

      {users.warnings.length > 0 && <AdminNotice>用户数据源提示：{users.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AdminMetricCard label="匹配用户" value={formatNumber(users.total)} hint={q ? `搜索：${q}` : "当前列表"} />
        <AdminMetricCard label="样本余额" value={formatNumber(totalCredits)} hint="当前页用户合计" />
        <AdminMetricCard label="样本消耗" value={formatNumber(totalUsed)} hint="当前页用户合计" />
        <AdminMetricCard label="样本生成" value={formatNumber(totalGenerations)} hint="当前页最多统计 2000 条" />
      </div>

      <AdminSection
        title="用户列表"
        description="主数据来自 profiles，生成/工作流统计为后台实时聚合样本。"
        actions={
          <form action="/admin/users" className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索邮箱"
                className="h-9 w-52 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm font-semibold outline-none focus:border-slate-400"
              />
            </div>
            <button className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white" type="submit">
              搜索
            </button>
          </form>
        }
      >
        <AdminTable<AdminUserListItem>
          rows={users.rows}
          rowKey={(row) => row.id}
          empty="暂无用户"
          columns={[
            {
              key: "user",
              label: "用户",
              render: (row) => (
                <div className="min-w-[240px]">
                  <p className="truncate text-sm font-black text-slate-950">{row.email || "未记录邮箱"}</p>
                  <Link href={`/admin/users/${row.id}`} className="mt-1 inline-flex text-xs font-black text-slate-700 hover:underline">
                    查看详情
                  </Link>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.id}</p>
                </div>
              ),
            },
            {
              key: "credits",
              label: "余额",
              render: (row) => <span className="font-mono text-sm font-black text-slate-800">{formatNumber(row.credits)}</span>,
            },
            {
              key: "used",
              label: "累计消耗",
              render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{formatNumber(row.totalCreditsUsed)}</span>,
            },
            {
              key: "generations",
              label: "生成",
              render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{formatNumber(row.generationCount)}</span>,
            },
            {
              key: "workflows",
              label: "工作流",
              render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{formatNumber(row.workflowCount)}</span>,
            },
            {
              key: "latest",
              label: "最近生成",
              render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.latestGenerationAt)}</span>,
            },
            {
              key: "created",
              label: "注册",
              render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span>,
            },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
