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

      <AdminSection title="运行时环境" description="各项服务的连接状态，只显示是否配置，不显示密钥内容。">
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
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
