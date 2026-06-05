import Link from "next/link";
import { RefreshCw } from "lucide-react";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
  formatNumber,
  shortAdminCode,
} from "@/components/admin/AdminPrimitives";
import { AdminWorkerRunForm } from "@/components/admin/AdminWorkerRunForm";
import { getAdminWorkerOverview, type AdminAuditLog, type AdminTaskListItem, type AdminWorkerProcessor } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminWorkersPage() {
  const overview = await getAdminWorkerOverview();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Queue"
        title="任务队列与处理服务"
        description="查看队列积压、长时间未完成任务和处理服务健康状态，并在有操作记录的前提下手动触发处理。"
        actions={
          <Link
            href="/admin/workers"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Link>
        }
      />

      {overview.warnings.length > 0 && (
        <AdminNotice>
          处理服务数据提示：{overview.warnings.slice(0, 3).join("；")}
        </AdminNotice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AdminMetricCard label="样本任务" value={formatNumber(overview.queue.sampled)} hint="最近队列样本" />
        <AdminMetricCard label="排队" value={formatNumber(overview.queue.queued)} tone="warning" />
        <AdminMetricCard label="运行" value={formatNumber(overview.queue.running)} />
        <AdminMetricCard label="长时间未完成" value={formatNumber(overview.queue.stale)} tone={overview.queue.stale > 0 ? "danger" : "good"} hint={`${overview.queue.staleMinutes} 分钟无进展`} />
        <AdminMetricCard label="失败" value={formatNumber(overview.queue.failed)} tone={overview.queue.failed > 0 ? "danger" : "neutral"} />
        <AdminMetricCard label="完成" value={formatNumber(overview.queue.completed)} tone="good" />
      </div>

      <AdminSection title="手动触发处理" description="用于处理积压或验证修复。所有触发都会保留操作记录，并返回处理结果摘要。">
        <AdminWorkerRunForm />
      </AdminSection>

      <AdminSection title="处理服务健康" description="只展示配置是否可用，不展示密钥内容。">
        <AdminTable<AdminWorkerProcessor>
          rows={overview.processors}
          rowKey={(row) => row.key}
          columns={[
            { key: "label", label: "处理服务", render: (row) => <span className="font-black text-slate-950">{row.label}</span> },
            { key: "endpoint", label: "入口", render: (row) => <code className="text-xs font-bold text-slate-600">{row.endpoint}</code> },
            { key: "configured", label: "配置状态", render: (row) => <AdminStatusBadge status={row.configured ? "completed" : "failed"} group={row.configured ? "completed" : "failed"} /> },
            { key: "batch", label: "批量", render: (row) => <span className="font-mono text-sm font-black text-slate-700">{row.batchSize}</span> },
            {
              key: "secretNames",
              label: "候选变量",
              render: (row) => (
                <div className="flex max-w-[360px] flex-wrap gap-1">
                  {row.secretNames.map((name) => <code key={name} className="rounded bg-slate-100 px-1.5 py-1 text-[11px] font-bold text-slate-600">{name}</code>)}
                </div>
              ),
            },
            { key: "hint", label: "状态", render: (row) => <p className="max-w-[320px] text-xs leading-5 text-slate-500">{row.statusHint}</p> },
          ]}
        />
      </AdminSection>

      <AdminSection title="长时间未完成任务" description="运行中且超过阈值没有进展的任务。手动重新处理前先查看任务详情，避免重复扣费或重复补偿。">
        <AdminTable<AdminTaskListItem>
          rows={overview.staleTasks}
          rowKey={(row) => row.id}
          empty="暂无长时间未完成任务"
          columns={[
            {
              key: "task",
              label: "任务",
              render: (row) => (
                <div className="min-w-[240px]">
                  <AdminStatusBadge status={row.status} group={row.statusGroup} />
                  <Link href={`/admin/generations/${row.sourceId}`} className="mt-1 block truncate text-sm font-black text-slate-950 hover:underline">
                    {row.title}
                  </Link>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{shortAdminCode(row.sourceId, "任务")}</p>
                </div>
              ),
            },
            { key: "module", label: "模块", render: (row) => <span className="whitespace-nowrap text-sm font-bold text-slate-700">{row.moduleLabel}</span> },
            { key: "progress", label: "进度", render: (row) => <span className="font-mono text-sm font-black text-slate-700">{row.progress}%</span> },
            { key: "updated", label: "更新时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.updatedAt)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="最近手动触发记录" description="用于追踪谁在什么时候手动触发了处理，方便排查重复执行和异常补偿。">
        <AdminTable<AdminAuditLog>
          rows={overview.recentRuns}
          rowKey={(row) => row.id}
          empty="暂无手动触发记录"
          columns={[
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
            { key: "action", label: "动作", render: (row) => <span className="font-mono text-xs font-black text-slate-700">{row.action}</span> },
            { key: "actor", label: "操作人", render: (row) => <span className="text-xs font-bold text-slate-600">{row.actorEmail || row.actorUserId || "-"}</span> },
            { key: "reason", label: "原因", render: (row) => <span className="text-xs text-slate-500">{row.reason || "-"}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}
