import Link from "next/link";
import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { AdminModelRoutingForm } from "@/components/admin/AdminModelRoutingForm";
import { AdminModelProviderConfigForm } from "@/components/admin/AdminModelProviderConfigForm";
import { AdminLlmProviderConfigForm } from "@/components/admin/AdminLlmProviderConfigForm";
import { AdminVideoProviderConfigForm } from "@/components/admin/AdminVideoProviderConfigForm";
import { getAdminProviderCatalog } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminProvidersPage() {
  const catalog = await getAdminProviderCatalog();
  const unpublishedKinds = [
    ["llm", "视觉/文本识别", catalog.providerPublish.llm],
    ["model", "生图模型", catalog.providerPublish.model],
    ["video", "视频生成", catalog.providerPublish.video],
  ].filter(([, , published]) => !published) as Array<[string, string, boolean]>;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Providers"
        title="模型与供应商"
        description="集中管理视觉/文本识别、生图和视频生成三条生产链路的供应商配置；发布后立即生效，API Key 加密落库。"
      />

      {unpublishedKinds.length > 0 ? (
        <AdminNotice tone="warning">
          尚未发布供应商配置：{unpublishedKinds.map(([key, label]) => `${label}（${key}）`).join("、")}。
          未发布时前台对应功能会使用兜底配置或直接不可用，请完成下方配置并点击「保存并发布」。
        </AdminNotice>
      ) : (
        <AdminNotice tone="info">
          三条生产链路的供应商配置均已发布。默认生图模型为 {catalog.defaultModel}；本页不会泄露 API Key 明文。
        </AdminNotice>
      )}

      <AdminSection title="模型通道快速切换" description="保存后会发布 model.routing，新生成任务立即按这里选择的 GPT 与 Banana 通道走。">
        <AdminModelRoutingForm routing={catalog.routing} />
      </AdminSection>

      <AdminSection title="生图供应商配置" description="按模型配置 Base URL、API Key 和上游模型名。这里发布的 model.providers 是生图模型唯一配置来源。">
        <AdminModelProviderConfigForm />
      </AdminSection>

      <AdminSection title="视觉/文本识别供应商配置" description="配置视觉图片识别和文本提示词模型。这里发布的 llm.providers 是视觉/文本识别的唯一配置来源；未发布时姿势裂变、服装识别等前台功能无法工作。">
        <AdminLlmProviderConfigForm />
      </AdminSection>

      <AdminSection title="视频生成供应商配置" description="配置 AI 视频生成模型（MiniMax H3 或 HappyHorse）。这里发布的 video.providers 是视频生成的唯一配置来源。">
        <AdminVideoProviderConfigForm />
      </AdminSection>

      <AdminSection title="模型路由" description="当前生效的默认模型、通道选择和灵点成本（价格来自 lib/model-pricing.ts 统一配置）。">
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
              label: "当前通道",
              render: (row) => <span className="text-sm font-black text-[var(--admin-fg)]">{row.provider}</span>,
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
              key: "notes",
              label: "说明",
              render: (row) => <p className="max-w-[280px] text-xs leading-5 text-[var(--admin-muted)]">{row.notes}</p>,
            },
          ]}
        />
      </AdminSection>

      <AdminSection title="模块接入矩阵" description="每个前台生成模块对应的后台运维入口，方便按模块排查任务。">
        <AdminTable<(typeof catalog.modules)[number]>
          rows={catalog.modules}
          rowKey={(row) => row.key}
          columns={[
            { key: "label", label: "模块", render: (row) => <span className="font-black text-[var(--admin-fg)]">{row.label}</span> },
            { key: "route", label: "用户端入口", render: (row) => <code className="text-xs font-bold text-[var(--admin-fg)]">{row.route}</code> },
            {
              key: "adminHref",
              label: "后台入口",
              render: (row) => (
                <Link
                  href={row.adminHref}
                  className="inline-flex items-center gap-1 text-xs font-black text-[var(--admin-link)] hover:underline"
                >
                  进入 {row.label}
                </Link>
              ),
            },
            {
              key: "risk",
              label: "操作风险",
              render: (row) => (
                <span className={`rounded-md px-2 py-1 text-xs font-black ${
                  row.risk === "high" ? "bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]" : row.risk === "medium" ? "bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]" : "bg-[var(--admin-success-soft)] text-[var(--admin-success)]"
                }`}>
                  {row.risk === "high" ? "高" : row.risk === "medium" ? "中" : "低"}
                </span>
              ),
            },
          ]}
        />
      </AdminSection>
    </div>
  );
}
