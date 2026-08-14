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

const ACTION_GROUPS: Array<{ label: string; actions: Array<{ value: string; label: string }> }> = [
  { label: "试衣配置", actions: [
    { value: "tryon.categories.seed_defaults", label: "初始化服装分类" },
    { value: "tryon.category.disable", label: "停用服装分类" },
    { value: "tryon.category.upsert", label: "保存服装分类" },
    { value: "tryon.reference_config.publish", label: "发布试衣配置" },
    { value: "tryon.reference_config.rollback", label: "回滚试衣配置" },
    { value: "tryon.reference_config.validate", label: "校验试衣配置" },
    { value: "tryon.reference_scene.archive", label: "归档参考场景" },
    { value: "tryon.reference_scene.patch", label: "修改参考场景" },
    { value: "tryon.reference_scene.upsert", label: "保存参考场景" },
    { value: "tryon.reference_scenes.import", label: "导入参考场景" },
  ]},
  { label: "支付账单", actions: [
    { value: "billing.catalog.sync_stripe", label: "同步支付商品" },
    { value: "billing.order.refund", label: "订单退款" },
    { value: "billing.price.create", label: "新建价格" },
    { value: "billing.product.upsert", label: "保存支付商品" },
    { value: "billing.webhook_event.replay", label: "重放支付回调" },
  ]},
  { label: "邀请码", actions: [
    { value: "invite_code.create", label: "创建邀请码" },
    { value: "invite_code.status.update", label: "变更邀请码状态" },
  ]},
  { label: "审批中心", actions: [
    { value: "operation_request.approve", label: "通过审批" },
    { value: "operation_request.create", label: "创建审批" },
    { value: "operation_request.reject", label: "驳回审批" },
  ]},
  { label: "用户账户", actions: [
    { value: "user.control.update", label: "更新账户管控" },
    { value: "user.profile.update", label: "更新用户资料" },
  ]},
  { label: "配置版本", actions: [
    { value: "config_version.create", label: "创建配置版本" },
    { value: "prompt_experiment_config.create", label: "保存提示词实验" },
    { value: "product_retouch_skill.create_draft", label: "保存精修草稿" },
    { value: "product_retouch_skill.publish", label: "发布精修配置" },
  ]},
  { label: "成员权限", actions: [
    { value: "admin_member.upsert", label: "保存成员" },
  ]},
  { label: "资产作品", actions: [
    { value: "asset_lifecycle.plan.create", label: "创建生命周期计划" },
  ]},
];

const ACTION_LABELS = new Map<string, string>(
  ACTION_GROUPS.flatMap((group) => group.actions.map((item) => [item.value, item.label])),
);

function actionLabel(value: string) {
  return ACTION_LABELS.get(value) || value;
}

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
        eyebrow="审计日志"
        title="审计日志"
        description="追踪后台所有写操作（发布配置、退款、审批、邀请码等），确认谁在什么时候处理了什么问题。"
      />

      {!audit.available && (
        <AdminNotice>
          操作记录数据尚未就绪。请联系技术支持完成数据初始化后刷新本页。
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
                    {group.actions.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
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
                  <p className="text-sm font-black text-[var(--admin-fg)]">{actionLabel(row.action)}</p>
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
