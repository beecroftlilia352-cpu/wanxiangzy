import Link from "next/link";
import { Activity, AlertTriangle, BarChart3, ClipboardCheck, Coins, DatabaseZap, FileDown, FlaskConical, Gauge, ImageIcon, RefreshCw, Settings, ShieldAlert, Users } from "lucide-react";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  ThumbnailStrip,
  formatDateTime,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { getAdminOverview, type AdminBreakdownItem, type AdminTaskListItem } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const overview = await getAdminOverview();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Console"
        title="运营总览"
        description="集中查看用户、生成任务、模型消耗、失败队列和数据链路健康。V1 以诊断和只读治理为主，避免绕过积分结算与 provider 幂等。"
        actions={
          <Link
            href="/admin"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Link>
        }
      />

      {overview.warnings.length > 0 && (
        <AdminNotice>
          部分数据源暂不可用：{overview.warnings.slice(0, 3).join("；")}
        </AdminNotice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {overview.metrics.map((metric) => (
          <AdminMetricCard
            key={metric.label}
            label={metric.label}
            value={metric.label === "失败率" ? metric.value : formatNumber(metric.value)}
            suffix={metric.label === "失败率" ? "%" : undefined}
            hint={metric.hint}
            tone={metric.tone}
          />
        ))}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(360px,0.9fr)]">
        <AdminSection title="最近任务" description="来自 task_queue_items，缺失时回退 generations / agent_workflows。">
          <AdminTable<AdminTaskListItem>
            rows={overview.recentTasks}
            rowKey={(row) => row.id}
            empty="暂无最近任务"
            columns={[
              {
                key: "task",
                label: "任务",
                render: (row) => (
                  <div className="min-w-[220px]">
                    <div className="flex items-center gap-2">
                      <AdminStatusBadge status={row.status} group={row.statusGroup} />
                      <span className="text-xs font-bold text-slate-400">{row.sourceType}</span>
                    </div>
                    <p className="mt-1 truncate text-sm font-black text-slate-950">{row.title}</p>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.sourceId}</p>
                  </div>
                ),
              },
              {
                key: "images",
                label: "图像",
                render: (row) => <ThumbnailStrip urls={row.resultThumbnails.length ? row.resultThumbnails : row.inputThumbnails} />,
              },
              {
                key: "module",
                label: "模块",
                render: (row) => <span className="text-sm font-bold text-slate-700">{row.moduleLabel}</span>,
              },
              {
                key: "progress",
                label: "进度",
                render: (row) => <span className="font-mono text-sm font-black text-slate-700">{row.progress}%</span>,
              },
              {
                key: "time",
                label: "时间",
                render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span>,
              },
            ]}
          />
        </AdminSection>

        <div className="space-y-5">
          <AdminSection title="任务健康" description="queued/running/failed 是后台诊断的第一入口。">
            <div className="grid grid-cols-2 gap-3 p-4">
              <HealthTile label="排队中" value={overview.taskHealth.queued} tone="amber" />
              <HealthTile label="运行中" value={overview.taskHealth.running} tone="blue" />
              <HealthTile label="已完成" value={overview.taskHealth.completed} tone="emerald" />
              <HealthTile label="失败" value={overview.taskHealth.failed} tone="red" />
            </div>
          </AdminSection>

          <AdminSection title="快速入口">
            <div className="grid grid-cols-2 gap-2 p-4">
              <QuickLink href="/admin/users" icon={<Users className="h-4 w-4" />} label="用户管理" />
              <QuickLink href="/admin/diagnostics" icon={<AlertTriangle className="h-4 w-4" />} label="异常诊断" />
              <QuickLink href="/admin/evals" icon={<FlaskConical className="h-4 w-4" />} label="Agent Eval" />
              <QuickLink href="/admin/credits" icon={<Coins className="h-4 w-4" />} label="积分流水" />
              <QuickLink href="/admin/requests" icon={<ClipboardCheck className="h-4 w-4" />} label="审批中心" />
              <QuickLink href="/admin/generations" icon={<Activity className="h-4 w-4" />} label="任务中心" />
              <QuickLink href="/admin/assets" icon={<ImageIcon className="h-4 w-4" />} label="资产作品" />
              <QuickLink href="/admin/reports" icon={<BarChart3 className="h-4 w-4" />} label="成本报表" />
              <QuickLink href="/admin/exports" icon={<FileDown className="h-4 w-4" />} label="导出视图" />
              <QuickLink href="/admin/moderation" icon={<ShieldAlert className="h-4 w-4" />} label="内容审核" />
              <QuickLink href="/admin/providers" icon={<DatabaseZap className="h-4 w-4" />} label="供应商" />
              <QuickLink href="/admin/workers" icon={<Gauge className="h-4 w-4" />} label="Worker" />
              <QuickLink href="/admin/settings" icon={<Settings className="h-4 w-4" />} label="系统配置" />
            </div>
          </AdminSection>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <BreakdownSection title="模块分布" rows={overview.moduleStats} />
        <BreakdownSection title="模型分布" rows={overview.modelStats} />
      </div>
    </div>
  );
}

function HealthTile({ label, value, tone }: { label: string; value: number; tone: "amber" | "blue" | "emerald" | "red" }) {
  const toneClass = {
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    blue: "bg-blue-50 text-blue-800 border-blue-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    red: "bg-red-50 text-red-800 border-red-200",
  }[tone];

  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <p className="text-xs font-black">{label}</p>
      <p className="mt-2 text-xl font-black tabular-nums">{formatNumber(value)}</p>
    </div>
  );
}

function QuickLink({ href, icon, label }: { href: string; icon: React.ReactNode; label: string }) {
  return (
    <Link href={href} className="flex h-12 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-700 hover:bg-slate-50">
      {icon}
      {label}
    </Link>
  );
}

function BreakdownSection({ title, rows }: { title: string; rows: AdminBreakdownItem[] }) {
  return (
    <AdminSection title={title}>
      <AdminTable<AdminBreakdownItem>
        rows={rows}
        rowKey={(row) => row.key}
        empty="暂无统计样本"
        columns={[
          { key: "label", label: "名称", render: (row) => <span className="font-black text-slate-950">{row.label}</span> },
          { key: "count", label: "数量", render: (row) => <span className="font-mono font-black text-slate-700">{formatNumber(row.count)}</span> },
          { key: "running", label: "运行", render: (row) => <span className="font-mono font-bold text-blue-700">{formatNumber(row.running)}</span> },
          { key: "failed", label: "失败", render: (row) => <span className="font-mono font-bold text-red-700">{formatNumber(row.failed)}</span> },
          { key: "credits", label: "积分", render: (row) => <span className="font-mono font-bold text-slate-700">{formatNumber(row.credits)}</span> },
        ]}
      />
    </AdminSection>
  );
}
