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

const ACTION_GROUPS: Array<{ label: string; actions: string[] }> = [
  { label: "试衣配置", actions: ["tryon.categories.seed_defaults", "tryon.category.disable", "tryon.category.upsert", "tryon.reference_config.publish", "tryon.reference_config.rollback", "tryon.reference_config.validate", "tryon.reference_scene.archive", "tryon.reference_scene.patch", "tryon.reference_scene.upsert", "tryon.reference_scenes.import"] },
  { label: "支付账单", actions: ["billing.catalog.sync_stripe", "billing.order.refund", "billing.price.create", "billing.product.upsert", "billing.webhook_event.replay"] },
  { label: "邀请码", actions: ["invite_code.create", "invite_code.status.update"] },
  { label: "审批中心", actions: ["operation_request.approve", "operation_request.create", "operation_request.reject"] },
  { label: "用户账户", actions: ["user.control.update", "user.profile.update"] },
  { label: "配置版本", actions: ["config_version.create", "prompt_experiment_config.create", "product_retouch_skill.create_draft", "product_retouch_skill.publish"] },
  { label: "成员权限", actions: ["admin_member.upsert"] },
  { label: "资产作品", actions: ["asset_lifecycle.plan.create"] },
];

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminAuditPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const action = getSearchParam(params.action);
  const q = getSearchParam(params.q);
  const since = getSearchParam(params.since);

  const audit = await listAdminAuditLogs({
    limit: 100,
    action: action || undefined,
    q: q || undefined,
    since: /^\d{4}-\d{2}-\d{2}$/.test(since) ? since : undefined,
  });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Audit"
        title="审计日志"
        description="追踪后台所有写操作（发布配置、退款、审批、邀请码等），确认谁在什么时候处理了什么问题。"
      />

      {!audit.available && (
        <AdminNotice>
          操作记录数据尚未初始化。请先执行 supabase 初始化脚本中的 admin_audit_logs 建表语句（supabase/admin-console.sql），完成后刷新本页即会显示真实操作记录。
        </AdminNotice>
      )}
      {audit.warnings.length > 0 && <AdminNotice tone="info">审计数据源提示：{audit.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <AdminSection
        title="审计记录"
        description="按创建时间倒序展示最近 100 条；可用动作、操作者和起始日期筛选。"
        actions={
          <form method="GET" action="/admin/audit" className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--admin-muted)]">
              动作
              <select
                name="action"
                defaultValue={action}
                className="h-9 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-semibold text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
              >
                <option value="">全部</option>
                {ACTION_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.actions.map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--admin-muted)]">
              操作者
              <input
                name="q"
                type="search"
                defaultValue={q}
                placeholder="邮箱关键词"
                className="h-9 w-44 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-semibold text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
              />
            </label>
            <label className="flex items-center gap-1.5 text-xs font-bold text-[var(--admin-muted)]">
              起始日期
              <input
                name="since"
                type="date"
                defaultValue={since}
                className="h-9 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-semibold text-[var(--admin-fg)] outline-none focus:border-[var(--admin-accent)]"
              />
            </label>
            <button
              type="submit"
              className="h-9 rounded-lg bg-[var(--admin-fg)] px-4 text-xs font-black text-white hover:opacity-90"
            >
              筛选
            </button>
            {action || q || since ? (
              <a
                href="/admin/audit"
                className="inline-flex h-9 items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-bold text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)]"
              >
                清除
              </a>
            ) : null}
          </form>
        }
      >
        <AdminTable<AdminAuditLog>
          rows={audit.rows}
          rowKey={(row) => row.id}
          empty="当前筛选条件下暂无审计记录"
          columns={[
            {
              key: "action",
              label: "动作",
              render: (row) => (
                <div className="min-w-[180px]">
                  <p className="font-mono text-sm font-black text-[var(--admin-fg)]">{row.action}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--admin-muted)]">{resourceTypeLabel(row.resourceType)}</p>
                </div>
              ),
            },
            {
              key: "actor",
              label: "操作者",
              render: (row) => (
                <div className="min-w-[220px]">
                  <p className="truncate text-sm font-bold text-[var(--admin-fg)]">{row.actorEmail || "-"}</p>
                  <p className="mt-0.5 text-[11px] font-semibold text-[var(--admin-faint)]">{shortAdminCode(row.actorUserId, "用户")}</p>
                </div>
              ),
            },
            {
              key: "resource",
              label: "处理对象",
              render: (row) => <span className="text-xs font-semibold text-[var(--admin-fg)]">{shortAdminCode(row.resourceId, "编号")}</span>,
            },
            {
              key: "reason",
              label: "原因",
              render: (row) => <span className="text-xs font-semibold text-[var(--admin-fg)]">{row.reason || "-"}</span>,
            },
            {
              key: "time",
              label: "时间",
              render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.createdAt)}</span>,
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
