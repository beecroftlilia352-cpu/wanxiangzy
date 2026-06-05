import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  formatDateTime,
  resourceTypeLabel,
  shortAdminCode,
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
        description="集中追踪后台所有写操作，便于确认谁在什么时候处理了什么问题。"
      />

      {!audit.available && (
        <AdminNotice>
          操作记录数据尚未初始化。完成后台管理数据初始化后，此处会显示真实操作记录。
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
                  <p className="mt-1 text-xs font-semibold text-slate-500">{resourceTypeLabel(row.resourceType)}</p>
                </div>
              ),
            },
            {
              key: "actor",
              label: "操作者",
              render: (row) => (
                <div className="min-w-[220px]">
                  <p className="truncate text-sm font-bold text-slate-800">{row.actorEmail || "-"}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-slate-400">{shortAdminCode(row.actorUserId, "用户")}</p>
                </div>
              ),
            },
            {
              key: "resource",
              label: "处理对象",
              render: (row) => <span className="text-xs font-semibold text-slate-600">{shortAdminCode(row.resourceId, "编号")}</span>,
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
