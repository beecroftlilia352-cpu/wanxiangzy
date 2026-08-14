import Link from "next/link";
import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { AdminModelProviderConfigForm } from "@/components/admin/AdminModelProviderConfigForm";
import { AdminLlmProviderConfigForm } from "@/components/admin/AdminLlmProviderConfigForm";
import { AdminVideoProviderConfigForm } from "@/components/admin/AdminVideoProviderConfigForm";
import { getAdminProviderCatalog } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

const MODEL_BUSINESS_LABELS: Record<string, string> = {
  "nano-banana-2": "基础生图模型",
  "gpt-image-2": "精修生图模型",
  "nano-banana-pro": "高清生图模型",
};

export default async function AdminProvidersPage() {
  const catalog = await getAdminProviderCatalog();
  const unpublishedKinds = [
    ["llm", "图片识别与提示词", catalog.providerPublish.llm],
    ["model", "生图模型", catalog.providerPublish.model],
    ["video", "视频生成", catalog.providerPublish.video],
  ].filter(([, , published]) => !published) as Array<[string, string, boolean]>;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="模型与供应商"
        title="模型与供应商"
        description="管理生图、识别和视频三条生产链路的供应商连接。发布后立即生效，密钥加密保存。"
      />

      {unpublishedKinds.length > 0 ? (
        <AdminNotice tone="warning">
          尚未发布供应商配置：{unpublishedKinds.map(([key, label]) => `${label}（${key}）`).join("、")}。
          未发布时前台对应功能可能无法使用，请完成下方配置并点击「保存并发布」。
        </AdminNotice>
      ) : (
        <AdminNotice tone="info">
          三条生产链路的供应商配置均已发布。默认生图模型为 {catalog.defaultModel}；本页不会泄露密钥明文。
        </AdminNotice>
      )}

      <AdminSection title="生图模型供应商" description="每个生图模型实际连接的供应商。来源为「后台配置」时以这里的发布为准；「环境变量」是历史兜底配置，建议尽快在下方表单发布正式配置。">
        <AdminTable<(typeof catalog.modelProviders)[number]>
          rows={catalog.modelProviders}
          rowKey={(row) => row.model}
          columns={[
            {
              key: "model",
              label: "模型",
              render: (row) => (
                <div className="min-w-[160px]">
                  <p className="text-sm font-black text-[var(--admin-fg)]">{MODEL_BUSINESS_LABELS[row.model] || row.model}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--admin-muted)]">{row.notes}</p>
                </div>
              ),
            },
            {
              key: "status",
              label: "状态",
              render: (row) => <AdminStatusBadge status={row.enabled ? "completed" : "failed"} group={row.enabled ? "completed" : "failed"} />,
            },
            {
              key: "source",
              label: "配置来源",
              render: (row) => (
                <span className={`rounded-md px-2 py-1 text-xs font-black ${
                  row.source === "admin" ? "bg-[var(--admin-success-soft)] text-[var(--admin-success)]" : "bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]"
                }`}>
                  {row.source === "admin" ? "后台配置" : "环境变量兜底"}
                </span>
              ),
            },
            {
              key: "key",
              label: "密钥",
              render: (row) => <AdminStatusBadge status={row.apiKeyConfigured ? "completed" : "failed"} group={row.apiKeyConfigured ? "completed" : "failed"} />,
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
          ]}
        />
      </AdminSection>

      <AdminSection title="生图供应商配置" description="配置每个生图模型的连接信息。发布后立即生效；「保存并发布」是高危操作，会直接影响前台生成。">
        <AdminModelProviderConfigForm />
      </AdminSection>

      <AdminSection title="识别与提示词供应商配置" description="图片识别（服装识别、姿势识别）和提示词生成使用的模型连接。未发布时姿势裂变、服装识别等前台功能无法工作。">
        <AdminLlmProviderConfigForm />
      </AdminSection>

      <AdminSection title="视频生成供应商配置" description="AI 视频生成使用的模型连接。">
        <AdminVideoProviderConfigForm />
      </AdminSection>

      <AdminSection title="模块运维入口" description="每个前台生成模块对应的后台运维入口，方便按模块排查任务。">
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
