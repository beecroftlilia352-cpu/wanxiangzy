import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
} from "@/components/admin/AdminPrimitives";
import { AdminMemberForm } from "@/components/admin/AdminMemberForm";
import { listAdminMembers, type AdminMemberListItem } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminMembersPage() {
  const members = await listAdminMembers({ limit: 80 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Members"
        title="后台成员"
        description="管理后台访问入口。权限校验在服务端执行，middleware 只做登录粗拦截。"
      />

      {!members.available && (
        <AdminNotice>
          admin_members 表还未安装。执行 supabase/admin-console.sql 后，可通过 SQL 插入正式管理员。
        </AdminNotice>
      )}
      {members.warnings.length > 0 && <AdminNotice tone="info">成员数据源提示：{members.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <AdminSection title="添加或更新成员" description="通过 user_id upsert，停用成员请将 status 设为 disabled。">
        <AdminMemberForm />
      </AdminSection>

      <AdminSection title="成员列表" description="写操作通过服务端权限校验和审计记录，不在浏览器暴露 service role。">
        <AdminTable<AdminMemberListItem>
          rows={members.rows}
          rowKey={(row) => row.userId || row.email || row.role}
          empty="暂无后台成员"
          columns={[
            {
              key: "member",
              label: "成员",
              render: (row) => (
                <div className="min-w-[260px]">
                  <p className="truncate text-sm font-black text-slate-950">{row.email || row.displayName || "-"}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.userId || "-"}</p>
                </div>
              ),
            },
            { key: "role", label: "角色", render: (row) => <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{row.role}</span> },
            { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.enabled && row.status === "active" ? "completed" : "failed"} /> },
            { key: "created", label: "创建", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
            { key: "updated", label: "更新", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.updatedAt)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="添加管理员 SQL" description="先用 SQL 添加，后续再开放 UI 写操作。">
        <pre className="overflow-x-auto p-4 text-xs leading-6 text-slate-700">
{`INSERT INTO public.admin_members (user_id, email, role, status, enabled)
VALUES ('<auth-user-uuid>', 'admin@example.com', 'owner', 'active', true)
ON CONFLICT (user_id) DO UPDATE
SET role = EXCLUDED.role,
    status = EXCLUDED.status,
    enabled = EXCLUDED.enabled,
    updated_at = NOW();`}
        </pre>
      </AdminSection>
    </div>
  );
}
