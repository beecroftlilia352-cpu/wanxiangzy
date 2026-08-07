import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { AdminConfigForm } from "@/components/admin/AdminConfigForm";
import { AdminModelRoutingForm } from "@/components/admin/AdminModelRoutingForm";
import { getAdminProviderCatalog } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  const catalog = await getAdminProviderCatalog();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Providers"
        title="模型与供应商"
        description="集中查看模型路由、环境变量配置、灵点成本和业务模块接入边界；可快速切换 GPT-Image-2 与 Banana 的默认通道。"
      />

      <AdminNotice tone="info">
        默认模型为 {catalog.defaultModel}。当前页面只显示配置状态，不会泄露 API Key 明文。
      </AdminNotice>

      <AdminSection title="模型通道快速切换" description="保存后会发布 model.routing，新生成任务立即按这里的 GPT 与 Banana 通道走；环境变量仍作为兜底。">
        <AdminModelRoutingForm routing={catalog.routing} />
      </AdminSection>

      <AdminSection title="模型路由" description="价格来自 lib/model-pricing.ts 的统一配置；配置状态来自服务端环境变量和已发布的 model.routing。">
        <AdminTable<(typeof catalog.models)[number]>
          rows={catalog.models}
          rowKey={(row) => row.model}
          columns={[
            {
              key: "model",
              label: "模型",
              render: (row) => (
                <div className="min-w-[220px]">
                  <p className="font-mono text-sm font-black text-[var(--admin-fg)]">{row.model}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--admin-muted)]">{row.endpointKind}</p>
                </div>
              ),
            },
            {
              key: "provider",
              label: "供应商",
              render: (row) => <span className="text-sm font-black text-[var(--admin-fg)]">{row.provider}</span>,
            },
            {
              key: "configured",
              label: "配置",
              render: (row) => <AdminStatusBadge status={row.configured ? "completed" : "failed"} group={row.configured ? "completed" : "failed"} />,
            },
            {
              key: "cost",
              label: "灵点成本",
              render: (row) => (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(row.costs).map(([size, cost]) => (
                    <span key={size} className="rounded-md bg-[var(--admin-surface-soft)] px-2 py-1 text-xs font-black text-[var(--admin-fg)]">
                      {size}: {formatNumber(cost)}
                    </span>
                  ))}
                </div>
              ),
            },
            {
              key: "env",
              label: "环境变量",
              render: (row) => (
                <div className="flex max-w-[360px] flex-wrap gap-1">
                  {row.envKeys.map((key) => (
                    <code key={key} className="rounded bg-[var(--admin-surface-soft)] px-1.5 py-1 text-[11px] font-bold text-[var(--admin-fg)]">
                      {key}
                    </code>
                  ))}
                </div>
              ),
            },
            {
              key: "notes",
              label: "说明",
              render: (row) => <p className="max-w-[280px] text-xs leading-5 text-[var(--admin-muted)]">{row.notes}</p>,
            },
          ]}
        />
      </AdminSection>

      <AdminSection title="模块接入矩阵" description="用于确认每条生产链路都有后台管理入口。">
        <AdminTable<(typeof catalog.modules)[number]>
          rows={catalog.modules}
          rowKey={(row) => row.key}
          columns={[
            { key: "label", label: "模块", render: (row) => <span className="font-black text-[var(--admin-fg)]">{row.label}</span> },
            { key: "route", label: "用户端入口", render: (row) => <code className="text-xs font-bold text-[var(--admin-fg)]">{row.route}</code> },
            { key: "readModel", label: "后台数据源", render: (row) => <span className="text-xs font-semibold text-[var(--admin-fg)]">{row.readModel}</span> },
            {
              key: "risk",
              label: "操作风险",
              render: (row) => (
                <span className={`rounded-md px-2 py-1 text-xs font-black ${
                  row.risk === "high" ? "bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]" : row.risk === "medium" ? "bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]" : "bg-[var(--admin-success-soft)] text-[var(--admin-success)]"
                }`}>
                  {row.risk}
                </span>
              ),
            },
            { key: "adminV1", label: "V1 范围", render: (row) => <span className="text-xs font-bold text-[var(--admin-fg)]">{row.adminV1}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="模型策略版本" description="用配置版本管理模型开关、默认路由、备用 provider 和降级策略；发布动作会自动归档同 key 的旧版本。">
        <AdminConfigForm
          defaultConfigKey="model.routing"
          defaultValue={`{
  "gptImageProvider": "${catalog.routing.gptImageProvider}",
  "nanoBananaProvider": "${catalog.routing.nanoBananaProvider}",
  "models": {
    "gpt-image-2": { "enabled": true, "provider": "${catalog.routing.gptImageProvider}" },
    "nano-banana-2": { "enabled": true, "provider": "${catalog.routing.nanoBananaProvider}" },
    "nano-banana-pro": { "enabled": true, "provider": "${catalog.routing.nanoBananaProvider}" }
  },
  "degrade": {
    "disable4k": false,
    "fallbackModel": "nano-banana-2"
  }
}`}
        />
      </AdminSection>
    </div>
  );
}
