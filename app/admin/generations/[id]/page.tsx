import Link from "next/link";
import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  ThumbnailStrip,
  formatDateTime,
  formatNumber,
  shortAdminCode,
} from "@/components/admin/AdminPrimitives";
import { AdminTaskActions } from "@/components/admin/AdminTaskActions";
import {
  getAdminTaskDetail,
  type AdminAuditLog,
  type AdminCreditLogItem,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function AdminTaskDetailPage({ params }: PageProps) {
  const { id } = await params;
  const detail = await getAdminTaskDetail(id);
  const task = detail.task || detail.queueItem;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Task Detail"
        title={task?.title || "任务详情"}
        description="集中处理生成任务的状态、图片结果、灵点变动和操作记录，适合排查失败、卡住和补偿问题。"
        actions={
          <Link href="/admin/generations" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50">
            返回任务列表
          </Link>
        }
      />

      {!task && <AdminNotice tone="danger">未找到该任务。</AdminNotice>}
      {detail.warnings.length > 0 && <AdminNotice>任务详情数据源提示：{detail.warnings.slice(0, 3).join("；")}</AdminNotice>}

      {task && (
        <AdminSection title="任务摘要">
          <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-5">
            <DetailItem label="任务编号" value={shortAdminCode(task.sourceId, "任务")} />
            <DetailItem label="用户" value={shortAdminCode(task.userId, "用户")} href={`/admin/users/${task.userId}`} />
            <DetailItem label="模块" value={task.moduleLabel} />
            <DetailItem label="处理状态" value={task.isStale ? `长时间未完成 ${task.staleMinutes} 分钟` : "正常推进"} />
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">状态</dt>
              <dd className="mt-1"><AdminStatusBadge status={task.status} group={task.statusGroup} /></dd>
            </div>
            <DetailItem label="时间" value={formatDateTime(task.createdAt)} />
          </div>
        </AdminSection>
      )}

      {task && (
        <AdminSection
          title="任务操作"
          description="重新处理不会再次扣灵点；退灵点类操作会复用已有灵点记录，避免重复补偿。"
        >
          <div className="p-4">
            <AdminTaskActions
              id={task.sourceId}
              sourceType={task.sourceType}
              statusGroup={task.statusGroup}
              isStale={task.isStale}
            />
          </div>
        </AdminSection>
      )}

      {task && (
        <AdminSection title="输入与结果">
          <div className="grid gap-6 p-4 lg:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-400">输入</p>
              <ThumbnailStrip urls={task.inputThumbnails} />
            </div>
            <div>
              <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-slate-400">结果</p>
              <ThumbnailStrip urls={task.resultThumbnails} />
            </div>
          </div>
        </AdminSection>
      )}

      <AdminSection title="技术排查信息" description="运营日常处理通常不需要查看；只有排查参数异常或对接问题时再展开核对。">
        <pre className="max-h-[520px] overflow-auto p-4 text-xs leading-5 text-slate-700">
          {JSON.stringify(detail.payload, null, 2)}
        </pre>
      </AdminSection>

      <AdminSection title="灵点流水">
        <AdminTable<AdminCreditLogItem>
          rows={detail.creditLogs}
          rowKey={(row) => row.id}
          empty="暂无关联灵点流水"
          columns={[
            { key: "amount", label: "变动", render: (row) => <span className={`font-mono text-sm font-black ${row.amount >= 0 ? "text-emerald-700" : "text-red-700"}`}>{row.amount > 0 ? "+" : ""}{formatNumber(row.amount)}</span> },
            { key: "balance", label: "余额", render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{formatNumber(row.balance)}</span> },
            { key: "reason", label: "原因", render: (row) => <span className="text-sm font-semibold text-slate-700">{row.reason}</span> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
          ]}
        />
      </AdminSection>

      {detail.sourceType === "workflow" && (
        <div className="grid gap-5 xl:grid-cols-2">
          <JsonRows title="工作流步骤" rows={detail.workflowSteps} empty="暂无步骤" />
          <JsonRows title="工作流事件" rows={detail.workflowEvents} empty="暂无事件" />
        </div>
      )}

      <AdminSection title="审计记录">
        <AdminTable<AdminAuditLog>
          rows={detail.auditLogs}
          rowKey={(row) => row.id}
          empty="暂无关联审计记录"
          columns={[
            { key: "action", label: "动作", render: (row) => <span className="font-mono text-sm font-black text-slate-950">{row.action}</span> },
            { key: "actor", label: "操作者", render: (row) => <span className="text-sm font-semibold text-slate-700">{row.actorEmail || "-"}</span> },
            { key: "reason", label: "原因", render: (row) => <span className="text-sm font-semibold text-slate-700">{row.reason || "-"}</span> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function JsonRows({ title, rows, empty }: { title: string; rows: Array<Record<string, unknown>>; empty: string }) {
  return (
    <AdminSection title={title}>
      {rows.length ? (
        <div className="max-h-[420px] space-y-2 overflow-auto p-4">
          {rows.map((row, index) => (
            <pre key={`${title}-${index}`} className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-700">
              {JSON.stringify(row, null, 2)}
            </pre>
          ))}
        </div>
      ) : (
        <p className="p-4 text-sm font-bold text-slate-500">{empty}</p>
      )}
    </AdminSection>
  );
}

function DetailItem({ label, value, mono = false, href }: { label: string; value: string; mono?: boolean; href?: string }) {
  const content = href ? (
    <Link href={href} className="hover:underline">{value}</Link>
  ) : value;
  return (
    <div>
      <dt className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">{label}</dt>
      <dd className={`mt-1 break-all text-sm font-bold text-slate-800 ${mono ? "font-mono" : ""}`}>{content}</dd>
    </div>
  );
}
