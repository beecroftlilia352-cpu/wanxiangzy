import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
} from "@/components/admin/AdminPrimitives";
import { AdminConfigActions } from "@/components/admin/AdminConfigActions";
import { AdminConfigForm } from "@/components/admin/AdminConfigForm";
import { getAdminSettingsOverview, type AdminConfigVersion } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const settings = await getAdminSettingsOverview();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Settings"
        title="系统配置"
        description="统一查看运行时环境、后台配置版本和上线前需要确认的开关。配置发布会在下一阶段接入版本化审批。"
      />

      {!settings.available && (
        <AdminNotice>
          admin_config_versions 表还未安装。执行 supabase/admin-console.sql 后，可记录模型策略、限流策略和功能开关版本。
        </AdminNotice>
      )}
      {settings.warnings.length > 0 && <AdminNotice tone="info">配置数据源提示：{settings.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <AdminSection title="运行时环境" description="只显示是否配置，不显示密钥内容。">
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
          {settings.runtime.map((item) => (
            <div key={item.key} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-slate-950">{item.label}</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-400">{item.key}</p>
                </div>
                <AdminStatusBadge status={item.configured ? "completed" : "failed"} group={item.configured ? "completed" : "failed"} />
              </div>
              <p className="mt-2 text-xs font-bold uppercase tracking-[0.08em] text-slate-400">{item.scope}</p>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="创建配置版本" description="生产配置以版本形式写入，发布前请先在草稿中确认 JSON 和影响范围。">
        <AdminConfigForm />
      </AdminSection>

      <AdminSection title="配置版本" description="后续可用于模型路由、积分价格、功能开关和风控策略的版本化发布。">
        <AdminTable<AdminConfigVersion>
          rows={settings.configVersions}
          rowKey={(row) => row.id}
          empty="暂无配置版本"
          columns={[
            { key: "key", label: "配置键", render: (row) => <span className="font-mono text-sm font-black text-slate-950">{row.configKey}</span> },
            { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.status} /> },
            { key: "value", label: "内容", render: (row) => <code className="line-clamp-2 max-w-[420px] text-xs text-slate-600">{JSON.stringify(row.value)}</code> },
            { key: "published", label: "发布时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.publishedAt)}</span> },
            { key: "created", label: "创建", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
            { key: "actions", label: "操作", render: (row) => <AdminConfigActions id={row.id} status={row.status} /> },
          ]}
        />
      </AdminSection>
    </div>
  );
}
