import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { getAdminProviderCatalog } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default function AdminProvidersPage() {
  const catalog = getAdminProviderCatalog();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Providers"
        title="模型与供应商"
        description="集中查看模型路由、环境变量配置、积分成本和各业务模块接入边界。后续可扩展为模型开关、灰度、限流和成本策略。"
      />

      <AdminNotice tone="info">
        默认模型为 {catalog.defaultModel}。当前页面只读，不会泄露 API Key 明文。
      </AdminNotice>

      <AdminSection title="模型路由" description="成本来自 lib/api/lingya.ts 的 CREDIT_COSTS，配置状态来自服务端环境变量。">
        <AdminTable<(typeof catalog.models)[number]>
          rows={catalog.models}
          rowKey={(row) => row.model}
          columns={[
            {
              key: "model",
              label: "模型",
              render: (row) => (
                <div className="min-w-[220px]">
                  <p className="font-mono text-sm font-black text-slate-950">{row.model}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{row.endpointKind}</p>
                </div>
              ),
            },
            {
              key: "provider",
              label: "供应商",
              render: (row) => <span className="text-sm font-black text-slate-800">{row.provider}</span>,
            },
            {
              key: "configured",
              label: "配置",
              render: (row) => <AdminStatusBadge status={row.configured ? "completed" : "failed"} group={row.configured ? "completed" : "failed"} />,
            },
            {
              key: "cost",
              label: "积分成本",
              render: (row) => (
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(row.costs).map(([size, cost]) => (
                    <span key={size} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">
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
                    <code key={key} className="rounded bg-slate-100 px-1.5 py-1 text-[11px] font-bold text-slate-600">
                      {key}
                    </code>
                  ))}
                </div>
              ),
            },
            {
              key: "notes",
              label: "说明",
              render: (row) => <p className="max-w-[280px] text-xs leading-5 text-slate-500">{row.notes}</p>,
            },
          ]}
        />
      </AdminSection>

      <AdminSection title="模块接入矩阵" description="用于确保每条生产链路都有后台管理入口。">
        <AdminTable<(typeof catalog.modules)[number]>
          rows={catalog.modules}
          rowKey={(row) => row.key}
          columns={[
            { key: "label", label: "模块", render: (row) => <span className="font-black text-slate-950">{row.label}</span> },
            { key: "route", label: "用户端入口", render: (row) => <code className="text-xs font-bold text-slate-600">{row.route}</code> },
            { key: "readModel", label: "后台数据源", render: (row) => <span className="text-xs font-semibold text-slate-600">{row.readModel}</span> },
            {
              key: "risk",
              label: "操作风险",
              render: (row) => (
                <span className={`rounded-md px-2 py-1 text-xs font-black ${
                  row.risk === "high" ? "bg-red-50 text-red-700" : row.risk === "medium" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                }`}>
                  {row.risk}
                </span>
              ),
            },
            { key: "adminV1", label: "V1 范围", render: (row) => <span className="text-xs font-bold text-slate-700">{row.adminV1}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}
