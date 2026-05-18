import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { AdminExportForm } from "@/components/admin/AdminExportForm";
import { AdminSavedViewForm } from "@/components/admin/AdminSavedViewForm";
import {
  listAdminExportJobs,
  listAdminSavedViews,
  type AdminExportJob,
  type AdminSavedView,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminExportsPage() {
  const [exports, views] = await Promise.all([
    listAdminExportJobs({ limit: 80 }),
    listAdminSavedViews({ limit: 80 }),
  ]);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Exports"
        title="导出与保存视图"
        description="创建短期 CSV 下载链接，记录操作者水印、过期时间和下载审计；保存常用筛选视图，方便运营复用。"
      />

      {!exports.available && (
        <AdminNotice>
          admin_export_jobs 表尚未安装。执行 supabase/admin-console.sql 后可创建带水印导出。
        </AdminNotice>
      )}
      {!views.available && (
        <AdminNotice>
          admin_saved_views 表尚未安装。执行 supabase/admin-console.sql 后可保存表格筛选视图。
        </AdminNotice>
      )}
      {[...exports.warnings, ...views.warnings].length > 0 && (
        <AdminNotice tone="info">
          数据源提示：{[...exports.warnings, ...views.warnings].slice(0, 3).join("；")}
        </AdminNotice>
      )}

      <AdminSection title="创建导出" description="下载链接 1 小时内有效；CSV 第一行包含操作者、导出时间、过期时间等水印信息。">
        <AdminExportForm />
      </AdminSection>

      <AdminSection title="保存视图" description="保存常用筛选、列和排序配置。当前先集中管理，后续可在各列表页展示快捷入口。">
        <AdminSavedViewForm />
      </AdminSection>

      <AdminSection title="导出记录" description="最新记录在前。过期链接会在下载时被拒绝并标记。">
        <AdminTable<AdminExportJob>
          rows={exports.rows}
          rowKey={(row) => row.id}
          empty="暂无导出记录"
          columns={[
            {
              key: "export",
              label: "导出",
              render: (row) => (
                <div className="min-w-[220px]">
                  <AdminStatusBadge status={row.status} />
                  <p className="mt-1 font-mono text-xs font-black text-slate-700">{row.exportType}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.id}</p>
                </div>
              ),
            },
            { key: "rows", label: "行数", render: (row) => <span className="font-mono text-sm font-black text-slate-700">{formatNumber(row.rowCount)}</span> },
            { key: "actor", label: "操作者", render: (row) => <span className="text-xs font-bold text-slate-600">{row.requestedByEmail || row.requestedBy || "-"}</span> },
            { key: "created", label: "创建", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
            { key: "expires", label: "过期", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.expiresAt)}</span> },
            {
              key: "download",
              label: "下载",
              render: (row) => row.status === "ready" ? (
                <a
                  href={`/api/admin/exports/${row.id}/download?token=${encodeURIComponent(row.downloadToken)}`}
                  className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 hover:bg-slate-50"
                >
                  CSV
                </a>
              ) : <span className="text-xs font-semibold text-slate-400">不可用</span>,
            },
          ]}
        />
      </AdminSection>

      <AdminSection title="保存视图列表" description="团队视图可作为运营 SOP 的固定筛选入口。">
        <AdminTable<AdminSavedView>
          rows={views.rows}
          rowKey={(row) => row.id}
          empty="暂无保存视图"
          columns={[
            {
              key: "view",
              label: "视图",
              render: (row) => (
                <div className="min-w-[220px]">
                  <p className="text-sm font-black text-slate-950">{row.name}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">{row.id}</p>
                </div>
              ),
            },
            { key: "resource", label: "资源", render: (row) => <span className="font-mono text-xs font-black text-slate-700">{row.resource}</span> },
            { key: "visibility", label: "可见性", render: (row) => <span className="text-xs font-bold text-slate-600">{row.visibility}</span> },
            { key: "owner", label: "创建人", render: (row) => <span className="text-xs font-bold text-slate-600">{row.ownerEmail || row.ownerUserId || "-"}</span> },
            { key: "filters", label: "筛选", render: (row) => <code className="line-clamp-2 max-w-[360px] text-xs text-slate-500">{JSON.stringify(row.filters)}</code> },
            { key: "created", label: "创建", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}
