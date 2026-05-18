import { Search } from "lucide-react";
import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
} from "@/components/admin/AdminPrimitives";
import { listAdminModerationCases, type AdminModerationCase } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminModerationPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const cases = await listAdminModerationCases({ q, limit: 80 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Moderation"
        title="内容审核"
        description="集中查看素材、结果图和运营处理记录。下架类动作保留证据包和审计日志，避免直接物理删除。"
      />

      {!cases.available && (
        <AdminNotice>
          moderation_cases 表尚未安装。执行 supabase/admin-console.sql 后可记录审核、下架和复核案件。
        </AdminNotice>
      )}
      {cases.warnings.length > 0 && <AdminNotice tone="info">审核数据源提示：{cases.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <AdminSection
        title="审核案件"
        description="最新记录在前，可按案件 ID、资产 ID、动作、状态和原因搜索。"
        actions={
          <form action="/admin/moderation" className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              placeholder="搜索审核案件 / 资产 ID"
              className="h-9 w-64 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm font-semibold outline-none focus:border-slate-400"
            />
          </form>
        }
      >
        <AdminTable<AdminModerationCase>
          rows={cases.rows}
          rowKey={(row) => row.id}
          empty="暂无审核案件"
          columns={[
            {
              key: "case",
              label: "案件",
              render: (row) => (
                <div className="min-w-[220px]">
                  <AdminStatusBadge status={row.action} group={row.action === "hide" ? "failed" : row.action === "pass" ? "completed" : "queued"} />
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{row.id}</p>
                </div>
              ),
            },
            { key: "source", label: "对象", render: (row) => <span className="font-mono text-xs font-bold text-slate-600">{row.sourceType}:{row.sourceId}</span> },
            { key: "status", label: "状态", render: (row) => <span className="text-xs font-black text-slate-700">{row.status}</span> },
            { key: "reason", label: "原因", render: (row) => <p className="max-w-[360px] text-xs leading-5 text-slate-500">{row.reason || "-"}</p> },
            { key: "created", label: "创建", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
            { key: "resolved", label: "解决", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.resolvedAt)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
