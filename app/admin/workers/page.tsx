import Link from "next/link";
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
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
import { AdminWorkerRuntimeConfigForm } from "@/components/admin/AdminWorkerRuntimeConfigForm";
import { getAdminWorkerOverview, type AdminAuditLog, type AdminTaskListItem } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminWorkersPage() {
  const overview = await getAdminWorkerOverview();

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="任务队列"
        title="Worker 控制面"
        description="管理期望容量，观察实际在线 Worker、BullMQ 队列与事务 Outbox。服务器扩容由发布控制器执行，网页不会直接操作 PM2。"
        actions={
          <Link
            href="/admin/workers"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] shadow-sm hover:bg-[var(--admin-surface-soft)]"
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
        <AdminMetricCard label="在线 Worker" value={formatNumber(overview.runtime.actual.onlineInstances)} tone={overview.runtime.actual.drift ? "warning" : "good"} hint={`期望 ${overview.runtime.desired.desiredInstances}`} />
        <AdminMetricCard label="实际并发容量" value={formatNumber(overview.runtime.actual.activeCapacity)} hint={`${overview.runtime.actual.workerConcurrency} / 进程`} />
        <AdminMetricCard label="样本任务" value={formatNumber(overview.queue.sampled)} hint="最近队列样本" />
        <AdminMetricCard label="排队" value={formatNumber(overview.queue.queued)} tone="warning" />
        <AdminMetricCard label="运行" value={formatNumber(overview.queue.running)} />
        <AdminMetricCard label="长时间未完成" value={formatNumber(overview.queue.stale)} tone={overview.queue.stale > 0 ? "danger" : "good"} hint={`${overview.queue.staleMinutes} 分钟无进展`} />
        <AdminMetricCard label="失败" value={formatNumber(overview.queue.failed)} tone={overview.queue.failed > 0 ? "danger" : "neutral"} />
        <AdminMetricCard label="完成" value={formatNumber(overview.queue.completed)} tone="good" />
      </div>

      <AdminSection title="Worker 运行策略" description="这些值是版本化的期望配置。保存后由下一次部署应用 PM2 实例和进程参数，便于审计、回滚和横向扩展。">
        <AdminWorkerRuntimeConfigForm initialConfig={overview.runtime.desired} />
      </AdminSection>

      <AdminSection title="实时运行健康" description="容量模型：在线 Worker 实例 × 单进程并发。供应商自身的并发、RPM、熔断和智能路由仍在统一模型控制面内生效。">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <RuntimeHealthItem label="运行模式" value={overview.runtime.actual.mode} ok={overview.runtime.actual.mode === "bullmq"} />
          <RuntimeHealthItem label="BullMQ Redis" value={overview.runtime.bullmq.reachable ? `${overview.runtime.bullmq.latencyMs ?? 0} ms` : "不可达"} ok={overview.runtime.bullmq.reachable} />
          <RuntimeHealthItem label="队列状态" value={overview.runtime.bullmq.paused ? "已暂停" : "运行中"} ok={overview.runtime.bullmq.paused === false} />
          <RuntimeHealthItem label="配置漂移" value={overview.runtime.actual.drift ? "待发布应用" : "一致"} ok={!overview.runtime.actual.drift} />
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--admin-border)]">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[var(--admin-surface-soft)] text-[var(--admin-muted)]"><tr><th className="px-3 py-2 font-black">指标</th><th className="px-3 py-2 font-black">当前</th><th className="px-3 py-2 font-black">说明</th></tr></thead>
            <tbody className="divide-y divide-[var(--admin-border)]">
              <RuntimeRow label="Waiting / Active / Delayed / Failed" value={`${overview.runtime.bullmq.counts.waiting ?? 0} / ${overview.runtime.bullmq.counts.active ?? 0} / ${overview.runtime.bullmq.counts.delayed ?? 0} / ${overview.runtime.bullmq.counts.failed ?? 0}`} hint="BullMQ 实时任务状态" />
              <RuntimeRow label="Outbox pending / publishing / dead" value={`${overview.runtime.outbox.pending_count ?? 0} / ${overview.runtime.outbox.publishing_count ?? 0} / ${overview.runtime.outbox.dead_count ?? 0}`} hint="PostgreSQL 事务消息发布状态" />
              <RuntimeRow label="Relay 并发" value={String(overview.runtime.actual.relayConcurrency)} hint="每个 Worker 进程的 Outbox 发布并发" />
              <RuntimeRow label="配置版本" value={overview.runtime.configVersion?.id ? shortAdminCode(overview.runtime.configVersion.id, "版本") : "默认值"} hint={overview.runtime.configVersion?.publishedAt ? formatDateTime(overview.runtime.configVersion.publishedAt) : "尚未发布 Worker 配置"} />
            </tbody>
          </table>
        </div>
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--admin-border)]">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-[var(--admin-surface-soft)] text-[var(--admin-muted)]"><tr>{["Worker 实例", "发布版本", "PID", "并发", "最后心跳"].map((label) => <th key={label} className="px-3 py-2 font-black">{label}</th>)}</tr></thead>
            <tbody className="divide-y divide-[var(--admin-border)]">
              {overview.runtime.instances.length ? overview.runtime.instances.map((instance) => <tr key={instance.instanceId}><td className="px-3 py-2 font-mono font-black text-[var(--admin-fg)]">{instance.instanceId}</td><td className="px-3 py-2 font-mono text-[var(--admin-muted)]">{instance.release}</td><td className="px-3 py-2 font-mono text-[var(--admin-fg)]">{instance.pid}</td><td className="px-3 py-2 font-black text-[var(--admin-fg)]">{instance.concurrency}</td><td className="px-3 py-2 text-[var(--admin-muted)]">{formatDateTime(instance.lastSeenAt)}</td></tr>) : <tr><td colSpan={5} className="px-3 py-8 text-center font-bold text-[var(--admin-muted)]">暂无 Worker 应用心跳</td></tr>}
            </tbody>
          </table>
        </div>
      </AdminSection>

      <AdminSection title="受审计恢复" description="仅用于 Outbox 恢复或故障演练。正常任务由 BullMQ Worker 自动消费，不需要网页手动运行 Worker。">
        <AdminWorkerRunForm />
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
                  <Link href={`/admin/generations/${row.sourceId}`} className="mt-1 block truncate text-sm font-black text-[var(--admin-fg)] hover:underline">
                    {row.title}
                  </Link>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--admin-faint)]">{shortAdminCode(row.sourceId, "任务")}</p>
                </div>
              ),
            },
            { key: "module", label: "模块", render: (row) => <span className="whitespace-nowrap text-sm font-bold text-[var(--admin-fg)]">{row.moduleLabel}</span> },
            { key: "progress", label: "进度", render: (row) => <span className="font-mono text-sm font-black text-[var(--admin-fg)]">{row.progress}%</span> },
            { key: "updated", label: "更新时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.updatedAt)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="最近手动触发记录" description="用于追踪谁在什么时候手动触发了处理，方便排查重复执行和异常补偿。">
        <AdminTable<AdminAuditLog>
          rows={overview.recentRuns}
          rowKey={(row) => row.id}
          empty="暂无手动触发记录"
          columns={[
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.createdAt)}</span> },
            { key: "action", label: "动作", render: (row) => <span className="font-mono text-xs font-black text-[var(--admin-fg)]">{row.action}</span> },
            { key: "actor", label: "操作人", render: (row) => <span className="text-xs font-bold text-[var(--admin-fg)]">{row.actorEmail || row.actorUserId || "-"}</span> },
            { key: "reason", label: "原因", render: (row) => <span className="text-xs text-[var(--admin-muted)]">{row.reason || "-"}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function RuntimeHealthItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 py-3"><div><p className="text-[11px] font-black uppercase tracking-[0.08em] text-[var(--admin-faint)]">{label}</p><p className="mt-1 text-sm font-black text-[var(--admin-fg)]">{value}</p></div>{ok ? <CheckCircle2 className="h-4 w-4 text-[var(--admin-success)]" /> : <AlertTriangle className="h-4 w-4 text-[var(--admin-warning)]" />}</div>;
}

function RuntimeRow({ label, value, hint }: { label: string; value: string; hint: string }) {
  return <tr><td className="px-3 py-2 font-black text-[var(--admin-fg)]">{label}</td><td className="px-3 py-2 font-mono font-black text-[var(--admin-fg)]">{value}</td><td className="px-3 py-2 text-[var(--admin-muted)]">{hint}</td></tr>;
}
