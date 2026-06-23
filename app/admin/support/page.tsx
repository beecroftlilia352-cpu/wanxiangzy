import Link from "next/link";
import { Search } from "lucide-react";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { AdminSupportTicketActions } from "@/components/admin/AdminSupportTicketActions";
import { AdminSupportTicketForm } from "@/components/admin/AdminSupportTicketForm";
import { listAdminSupportTickets, type AdminSupportTicket } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "open", label: "新建" },
  { value: "pending", label: "处理中" },
  { value: "waiting_user", label: "等用户" },
  { value: "resolved", label: "已解决" },
  { value: "closed", label: "已关闭" },
];

const priorityOptions = [
  { value: "", label: "全部优先级" },
  { value: "urgent", label: "紧急" },
  { value: "high", label: "高" },
  { value: "medium", label: "中" },
  { value: "low", label: "低" },
];

const categoryOptions = [
  { value: "", label: "全部分类" },
  { value: "generation_failure", label: "生成失败" },
  { value: "credit_issue", label: "灵点问题" },
  { value: "content_moderation", label: "内容审核" },
  { value: "billing", label: "账单" },
  { value: "account", label: "账号" },
  { value: "technical", label: "技术问题" },
  { value: "other", label: "其他" },
];

export default async function AdminSupportPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const status = getSearchParam(params.status);
  const priority = getSearchParam(params.priority);
  const category = getSearchParam(params.category);
  const tickets = await listAdminSupportTickets({ q, status, priority, category, limit: q || status || priority || category ? 100 : 60 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Support"
        title="客服工单"
        description="集中跟进用户问题、失败生成、灵点争议、内容审核和技术故障；每次状态流转写入后台审计，便于后续接自动客服和 SLA。"
      />

      {!tickets.available && (
        <AdminNotice>
          admin_support_tickets 表尚未安装。执行 supabase/admin-console.sql 后可启用客服工单。
        </AdminNotice>
      )}
      {tickets.warnings.length > 0 && <AdminNotice tone="info">工单数据源提示：{tickets.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AdminMetricCard label="打开中" value={formatNumber(tickets.metrics.open)} hint="待客服首次处理" tone={tickets.metrics.open ? "warning" : "good"} />
        <AdminMetricCard label="处理中" value={formatNumber(tickets.metrics.pending)} hint="已有内部跟进" />
        <AdminMetricCard label="等用户" value={formatNumber(tickets.metrics.waitingUser)} hint="需要用户补充信息" />
        <AdminMetricCard label="紧急" value={formatNumber(tickets.metrics.urgent)} hint="高优先级响应池" tone={tickets.metrics.urgent ? "danger" : "good"} />
        <AdminMetricCard label="已解决" value={formatNumber(tickets.metrics.resolved)} hint="保留解决说明" tone="good" />
        <AdminMetricCard label="关联任务" value={formatNumber(tickets.metrics.linkedGenerations)} hint="可回跳任务详情" />
      </div>

      <AdminSection title="创建工单" description="支持人工录入客服问题；后续用户反馈、诊断和 Agent 可复用同一张表自动创建。">
        <AdminSupportTicketForm />
      </AdminSection>

      <AdminSection
        title="工单列表"
        description="按状态、优先级和分类筛选；标题、用户、generation、标签和处理人均可搜索。"
        actions={
          <form action="/admin/support" className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--admin-faint)]" />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索工单 / 用户 / 任务"
                className="h-9 w-60 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] pl-8 pr-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
              />
            </div>
            <select name="status" defaultValue={status} className="h-9 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-bold text-[var(--admin-fg)]">
              {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select name="priority" defaultValue={priority} className="h-9 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-bold text-[var(--admin-fg)]">
              {priorityOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select name="category" defaultValue={category} className="h-9 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-bold text-[var(--admin-fg)]">
              {categoryOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button className="h-9 rounded-lg bg-[var(--admin-fg)] px-3 text-xs font-black text-white" type="submit">
              筛选
            </button>
          </form>
        }
      >
        <AdminTable<AdminSupportTicket>
          rows={tickets.rows}
          rowKey={(row) => row.id}
          empty="暂无客服工单"
          columns={[
            {
              key: "ticket",
              label: "工单",
              render: (row) => (
                <div className="min-w-[260px]">
                  <div className="flex items-center gap-2">
                    <AdminStatusBadge status={row.status} group={statusGroup(row.status)} />
                    <PriorityBadge priority={row.priority} />
                  </div>
                  <p className="mt-1 text-sm font-black text-[var(--admin-fg)]">{row.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--admin-faint)]">{row.ticketNo || row.id}</p>
                </div>
              ),
            },
            {
              key: "user",
              label: "用户",
              render: (row) => (
                <div className="min-w-[200px]">
                  <p className="truncate text-xs font-bold text-[var(--admin-fg)]">{row.userEmail || "-"}</p>
                  {row.userId ? (
                    <Link href={`/admin/users/${row.userId}`} className="mt-1 block truncate font-mono text-[11px] font-bold text-[var(--admin-muted)] hover:text-[var(--admin-fg)]">
                      {row.userId}
                    </Link>
                  ) : (
                    <p className="mt-1 text-[11px] text-[var(--admin-faint)]">未绑定用户 ID</p>
                  )}
                </div>
              ),
            },
            {
              key: "linked",
              label: "关联",
              render: (row) => (
                <div className="min-w-[220px]">
                  {row.generationId ? (
                    <Link href={`/admin/generations/${row.generationId}`} className="block truncate font-mono text-xs font-bold text-[var(--admin-fg)] hover:text-[var(--admin-fg)]">
                      gen:{row.generationId}
                    </Link>
                  ) : <span className="text-xs font-semibold text-[var(--admin-faint)]">未关联任务</span>}
                  {row.assetSourceId && <p className="mt-1 truncate font-mono text-[11px] text-[var(--admin-muted)]">{row.assetSourceType}:{row.assetSourceId}</p>}
                </div>
              ),
            },
            { key: "category", label: "分类", render: (row) => <span className="font-mono text-xs font-black text-[var(--admin-fg)]">{row.category}</span> },
            {
              key: "description",
              label: "问题",
              render: (row) => (
                <div className="max-w-[340px]">
                  <p className="line-clamp-2 text-xs leading-5 text-[var(--admin-muted)]">{row.description}</p>
                  {row.resolution && <p className="mt-1 line-clamp-1 text-xs font-bold text-[var(--admin-success)]">{row.resolution}</p>}
                </div>
              ),
            },
            { key: "owner", label: "处理人", render: (row) => <span className="text-xs font-bold text-[var(--admin-fg)]">{row.assignedToEmail || row.createdByEmail || "-"}</span> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.updatedAt || row.createdAt)}</span> },
            { key: "actions", label: "操作", render: (row) => <AdminSupportTicketActions id={row.id} status={row.status} /> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: AdminSupportTicket["priority"] }) {
  const className = priority === "urgent"
    ? "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]"
    : priority === "high"
      ? "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]"
      : priority === "low"
        ? "border-[var(--admin-border)] bg-[var(--admin-surface-soft)] text-[var(--admin-muted)]"
        : "border-[var(--admin-info-border)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]";
  return <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-black ${className}`}>{priority}</span>;
}

function statusGroup(status: AdminSupportTicket["status"]) {
  if (status === "resolved" || status === "closed") return "completed";
  if (status === "pending") return "running";
  if (status === "waiting_user") return "queued";
  return "failed";
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
