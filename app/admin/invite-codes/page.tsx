import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
} from "@/components/admin/AdminPrimitives";
import { AdminInviteCodeActions } from "@/components/admin/AdminInviteCodeActions";
import { AdminInviteCodeForm } from "@/components/admin/AdminInviteCodeForm";
import {
  getAdminInviteCodeOverview,
  type AdminInviteCode,
  type AdminInviteCodeUsage,
} from "@/lib/admin/invite-codes";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminInviteCodesPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const status = getSearchParam(params.status);
  const overview = await getAdminInviteCodeOverview({ q, status });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Invites"
        title="邀请码"
        description="临时限制注册入口。支持批量生成、生效期、过期时间、使用次数、批次渠道、启停状态和注册使用记录。"
        actions={
          <form action="/admin/invite-codes" className="flex flex-wrap items-center gap-2">
            <input
              name="q"
              defaultValue={q}
              className="h-9 w-56 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
              placeholder="搜索 code / 邮箱 / 备注"
            />
            <select
              name="status"
              defaultValue={status}
              className="h-9 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-sm font-bold text-[var(--admin-fg)]"
            >
              <option value="">全部状态</option>
              <option value="active">启用</option>
              <option value="disabled">停用</option>
            </select>
            <button type="submit" className="h-9 rounded-lg bg-[var(--admin-fg)] px-4 text-sm font-black text-white">
              筛选
            </button>
          </form>
        }
      />

      {!overview.available && (
        <AdminNotice>
          邀请码数据表尚未初始化。请先在 Supabase SQL Editor 执行 supabase/invite-codes.sql。
        </AdminNotice>
      )}
      {overview.warnings.length > 0 && <AdminNotice tone="info">邀请码数据源提示：{overview.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard label="邀请码" value={overview.metrics.totalCodes} hint="当前筛选范围" />
        <AdminMetricCard label="启用" value={overview.metrics.activeCodes} tone="good" />
        <AdminMetricCard label="已使用" value={overview.metrics.usedSlots} />
        <AdminMetricCard label="剩余额度" value={overview.metrics.remainingSlots} tone={overview.metrics.remainingSlots > 0 ? "good" : "warning"} />
        <AdminMetricCard label="使用记录" value={overview.metrics.usageRecords} />
      </div>

      <AdminSection title="生成邀请码" description="默认单码一次。主流运营配置包括批次渠道、生效时间、过期时间、单码次数和停用开关。">
        <AdminInviteCodeForm />
      </AdminSection>

      <AdminSection title="邀请码列表" description="前台注册只接受启用、未过期且仍有剩余额度的邀请码。">
        <AdminTable<AdminInviteCode>
          rows={overview.codes}
          rowKey={(row) => row.id}
          empty="暂无邀请码"
          columns={[
            {
              key: "code",
              label: "邀请码",
              render: (row) => <code className="font-mono text-sm font-black text-[var(--admin-fg)]">{row.code}</code>,
            },
            {
              key: "status",
              label: "状态",
              render: (row) => <AdminStatusBadge status={row.status === "active" ? "active" : "failed"} />,
            },
            {
              key: "usage",
              label: "额度",
              render: (row) => <span className="font-mono text-sm font-black text-[var(--admin-fg)]">{row.usedCount}/{row.maxUses}</span>,
            },
            {
              key: "campaign",
              label: "批次/渠道",
              render: (row) => <span className="min-w-[160px] text-sm font-black text-[var(--admin-fg)]">{row.campaign || "-"}</span>,
            },
            {
              key: "validity",
              label: "有效期",
              render: (row) => (
                <div className="min-w-[140px] text-xs font-semibold text-[var(--admin-muted)]">
                  <p>起 {formatDateTime(row.startsAt)}</p>
                  <p className="mt-1">止 {formatDateTime(row.expiresAt)}</p>
                </div>
              ),
            },
            {
              key: "note",
              label: "备注",
              render: (row) => <span className="line-clamp-2 min-w-[220px] text-sm font-semibold text-[var(--admin-fg)]">{row.note || "-"}</span>,
            },
            {
              key: "created",
              label: "创建",
              render: (row) => (
                <div className="min-w-[140px] text-xs font-semibold text-[var(--admin-muted)]">
                  <p>{formatDateTime(row.createdAt)}</p>
                  <p className="mt-1 truncate">{row.createdByEmail || "-"}</p>
                </div>
              ),
            },
            {
              key: "actions",
              label: "操作",
              render: (row) => <AdminInviteCodeActions id={row.id} status={row.status} />,
            },
          ]}
        />
      </AdminSection>

      <AdminSection title="使用记录" description="注册接口会先占用邀请码；如果注册失败，会释放并留下 released 记录。">
        <AdminTable<AdminInviteCodeUsage>
          rows={overview.usages}
          rowKey={(row) => row.id}
          empty="暂无使用记录"
          columns={[
            {
              key: "code",
              label: "邀请码",
              render: (row) => <code className="font-mono text-sm font-black text-[var(--admin-fg)]">{row.code}</code>,
            },
            {
              key: "email",
              label: "注册邮箱",
              render: (row) => <span className="min-w-[220px] text-sm font-black text-[var(--admin-fg)]">{row.email}</span>,
            },
            {
              key: "status",
              label: "状态",
              render: (row) => <AdminStatusBadge status={row.status === "used" ? "completed" : "pending"} />,
            },
            {
              key: "user",
              label: "用户",
              render: (row) => <span className="font-mono text-xs font-semibold text-[var(--admin-muted)]">{row.userId ? row.userId.slice(0, 8) : "-"}</span>,
            },
            {
              key: "reason",
              label: "说明",
              render: (row) => <span className="text-sm font-semibold text-[var(--admin-fg)]">{row.reason || "-"}</span>,
            },
            {
              key: "created",
              label: "时间",
              render: (row) => (
                <div className="min-w-[140px] text-xs font-semibold text-[var(--admin-muted)]">
                  <p>{formatDateTime(row.createdAt)}</p>
                  {row.releasedAt && <p className="mt-1">释放 {formatDateTime(row.releasedAt)}</p>}
                </div>
              ),
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
