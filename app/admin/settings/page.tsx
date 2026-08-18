import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
} from "@/components/admin/AdminPrimitives";
import { AdminConfigActions } from "@/components/admin/AdminConfigActions";
import { getAdminSettingsOverview, type AdminConfigVersion } from "@/lib/admin/data";
import { AdminMonitoringConfigForm } from "@/components/admin/AdminMonitoringConfigForm";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

const CONFIG_KEY_LABELS: Record<string, string> = {
  "model.routing": "生图通道（已废弃）",
  "model.providers": "生图供应商",
  "llm.providers": "识别与提示词供应商",
  "video.providers": "视频供应商",
  "tryon.reference_config": "试衣参考图配置",
  "skills.product-retouch": "商品精修配置",
  "prompt.experiments": "提示词实验",
  "features.flags": "功能开关",
  "rate_limit.config": "访问限流",
};

function configKeyLabel(value: string) {
  return CONFIG_KEY_LABELS[value] || value;
}

export default async function AdminSettingsPage() {
  await requireAdmin("settings:read");
  const settings = await getAdminSettingsOverview();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="系统配置"
        title="系统配置"
        description="查看系统运行环境和历史配置版本。供应商连接请到「模型与供应商」页配置。"
      />

      {!settings.available && (
        <AdminNotice>
          配置数据尚未就绪。请联系技术支持完成数据初始化后刷新本页。
        </AdminNotice>
      )}
      {settings.warnings.length > 0 && <AdminNotice tone="info">配置数据源提示：{settings.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <details className="rounded-xl border border-[var(--admin-border)] bg-[var(--admin-surface)]">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-black text-[var(--admin-fg)] [&::-webkit-details-marker]:hidden">
          运行时环境（高级）
          <span className="ml-2 text-xs font-semibold text-[var(--admin-muted)]">
            各项服务的连接状态 · 仅技术角色排查用 · 点击展开
          </span>
        </summary>
        <div className="grid gap-3 p-4 pt-0 md:grid-cols-2 xl:grid-cols-3">
          {settings.runtime.map((item) => (
            <div key={item.key} className="rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-[var(--admin-fg)]">{item.label}</p>
                  <p className="mt-1 truncate text-[11px] text-[var(--admin-faint)]">{item.key}</p>
                </div>
                <AdminStatusBadge status={item.configured ? "completed" : "failed"} group={item.configured ? "completed" : "failed"} />
              </div>
              <p className="mt-2 text-xs font-bold text-[var(--admin-faint)]">{item.scope}</p>
            </div>
          ))}
        </div>
      </details>

      <AdminSection
        title="监控与 SEO 配置"
        description="Sentry 错误监控与站点分享卡片文案统一在此管理，发布后运行时自动读取（含 5 分钟缓存）。"
      >
        <AdminMonitoringConfigForm />
      </AdminSection>

      <AdminSection title="历史配置版本" description="各配置项的发布记录，支持回滚。内容为技术细节，仅作排查参考。">
        <AdminTable<AdminConfigVersion>
          rows={settings.configVersions}
          rowKey={(row) => row.id}
          empty="暂无配置版本"
          columns={[
            { key: "key", label: "配置项", render: (row) => <span className="text-sm font-black text-[var(--admin-fg)]">{configKeyLabel(row.configKey)}</span> },
            { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.status} /> },
            { key: "value", label: "内容摘要", render: (row) => <code className="line-clamp-1 max-w-[360px] text-xs text-[var(--admin-fg)]">{JSON.stringify(row.value).slice(0, 120)}</code> },
            { key: "published", label: "发布时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.publishedAt)}</span> },
            { key: "created", label: "创建", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.createdAt)}</span> },
            { key: "actions", label: "操作", render: (row) => <AdminConfigActions id={row.id} status={row.status} /> },
          ]}
        />
      </AdminSection>
    </div>
  );
}
