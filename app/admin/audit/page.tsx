import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  formatDateTime,
} from "@/components/admin/AdminPrimitives";
import { listAdminAuditLogs, type AdminAuditLog } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminAuditPage() {
  const audit = await listAdminAuditLogs({ limit: 60 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Audit"
        title="审计日志"
        description="所有后台写操作都应写入 admin_audit_logs。V1 页面先验证审计底座和权限链路，后续写操作直接复用。"
      />

      {!audit.available && (
        <AdminNotice>
          admin_audit_logs 表还未安装。执行 supabase/admin-console.sql 后，此处会显示真实审计记录。
        </AdminNotice>
      )}
      {audit.warnings.length > 0 && <AdminNotice tone="info">审计数据源提示：{audit.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <AdminSection title="审计记录" description="按创建时间倒序展示最近记录。">
        <AdminTable<AdminAuditLog>
          rows={audit.rows}
          rowKey={(row) => row.id}
          empty="暂无审计记录"
          columns={[
            {
              key: "action",
              label: "动作",
              render: (row) => (
                <div className="min-w-[180px]">
                  <p className="font-mono text-sm font-black text-slate-950">{row.action}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{row.resourceType}</p>
                </div>
              ),
            },
            {
              key: "actor",
              label: "操作者",
              render: (row) => (
                <div className="min-w-[220px]">
                  <p className="truncate text-sm font-bold text-slate-800">{row.actorEmail || "-"}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">{row.actorUserId || "-"}</p>
                </div>
              ),
            },
            {
              key: "resource",
              label: "资源",
              render: (row) => <code className="text-xs font-semibold text-slate-600">{row.resourceId || "-"}</code>,
            },
            {
              key: "reason",
              label: "原因",
              render: (row) => <span className="text-xs font-semibold text-slate-600">{row.reason || "-"}</span>,
            },
            {
              key: "time",
              label: "时间",
              render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span>,
            },
          ]}
        />
      </AdminSection>
    </div>
  );
}
