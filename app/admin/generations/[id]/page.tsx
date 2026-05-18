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
} from "@/components/admin/AdminPrimitives";
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
        description="集中查看任务状态、输入输出、payload、积分流水、workflow 步骤和审计记录。"
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
            <DetailItem label="任务 ID" value={task.sourceId} mono />
            <DetailItem label="用户 ID" value={task.userId} mono href={`/admin/users/${task.userId}`} />
            <DetailItem label="模块" value={task.moduleLabel} />
            <div>
              <dt className="text-xs font-black uppercase tracking-[0.08em] text-slate-400">状态</dt>
              <dd className="mt-1"><AdminStatusBadge status={task.status} group={task.statusGroup} /></dd>
            </div>
            <DetailItem label="时间" value={formatDateTime(task.createdAt)} />
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

      <AdminSection title="Payload / 参数">
        <pre className="max-h-[520px] overflow-auto p-4 text-xs leading-5 text-slate-700">
          {JSON.stringify(detail.payload, null, 2)}
        </pre>
      </AdminSection>

      <AdminSection title="积分流水">
        <AdminTable<AdminCreditLogItem>
          rows={detail.creditLogs}
          rowKey={(row) => row.id}
          empty="暂无关联积分流水"
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
          <JsonRows title="Workflow Steps" rows={detail.workflowSteps} empty="暂无步骤" />
          <JsonRows title="Workflow Events" rows={detail.workflowEvents} empty="暂无事件" />
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
