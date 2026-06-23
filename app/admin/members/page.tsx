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
        description="给已注册用户开通后台访问权限。运营只需要搜索账号、选择角色和状态。"
      />

      {!members.available && (
        <AdminNotice>
          后台成员数据表尚未初始化。请先完成后台管理数据初始化，再添加正式管理员。
        </AdminNotice>
      )}
      {members.warnings.length > 0 && <AdminNotice tone="info">成员数据源提示：{members.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <AdminSection title="添加或更新成员" description="先搜索用户账号，再选择后台角色。停用成员不会删除记录，可随时重新启用。">
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
                  <p className="truncate text-sm font-black text-[var(--admin-fg)]">{row.email || row.displayName || "-"}</p>
                </div>
              ),
            },
            { key: "role", label: "角色", render: (row) => <span className="rounded-md bg-[var(--admin-surface-soft)] px-2 py-1 text-xs font-black text-[var(--admin-fg)]">{roleLabel(row.role)}</span> },
            { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.enabled && row.status === "active" ? "completed" : "failed"} /> },
            { key: "created", label: "创建", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.createdAt)}</span> },
            { key: "updated", label: "更新", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.updatedAt)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="操作提示" description="如果搜索不到成员，请让对方先正常登录一次产品，再回到这里搜索邮箱添加。">
        <div className="p-4 text-sm font-semibold leading-6 text-[var(--admin-fg)]">
          角色建议：日常运营选择“运营”，审核同学选择“审核”，财务同学选择“财务”，只需要看数据的人选择“只读”。
        </div>
      </AdminSection>
    </div>
  );
}

function roleLabel(role: string) {
  if (role === "owner") return "负责人";
  if (role === "ops") return "运营";
  if (role === "support") return "客服";
  if (role === "finance") return "财务";
  if (role === "reviewer") return "审核";
  if (role === "engineer") return "工程";
  return "只读";
}
