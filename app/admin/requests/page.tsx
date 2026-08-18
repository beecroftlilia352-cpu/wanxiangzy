import { Search } from "lucide-react";
import {
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  formatDateTime,
  formatNumber,
  operationTypeLabel,
  resourceTypeLabel,
  shortAdminCode,
} from "@/components/admin/AdminPrimitives";
import { AdminOperationRequestActions } from "@/components/admin/AdminOperationRequestActions";
import { listAdminOperationRequests, type AdminOperationRequest } from "@/lib/admin/data";
import { requireAdmin } from "@/lib/admin/auth";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "pending", label: "待审批" },
  { value: "approved", label: "已通过" },
  { value: "rejected", label: "已驳回" },
  { value: "failed", label: "执行失败" },
];

export default async function AdminRequestsPage({ searchParams }: PageProps) {
  await requireAdmin("operation_requests:read");
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const status = getSearchParam(params.status);
  const requests = await listAdminOperationRequests({ q, status, limit: q || status ? 100 : 60 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="审批中心"
        title="审批中心"
        description="集中处理高风险或需要授权的运营动作。当前支持灵点补偿审批，通过后会自动完成补偿并保留操作记录。"
      />

      {!requests.available && (
        <AdminNotice>
          审批数据尚未就绪。请联系技术支持完成数据初始化后刷新本页。
        </AdminNotice>
      )}
      {requests.warnings.length > 0 && <AdminNotice tone="info">审批数据源提示：{requests.warnings.slice(0, 3).join("；")}</AdminNotice>}

      <AdminSection
        title="审批单"
        description="财务和负责人可审批；通过、驳回和执行失败都会留下完整操作记录。"
        actions={
          <form action="/admin/requests" className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--admin-faint)]" />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索审批单 / 用户 / 原因"
                className="h-9 w-64 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] pl-8 pr-3 text-sm font-semibold outline-none focus:border-[var(--admin-border-strong)]"
              />
            </div>
            <select name="status" defaultValue={status} className="h-9 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-bold text-[var(--admin-fg)]">
              {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button className="h-9 rounded-lg bg-[var(--admin-fg)] px-3 text-xs font-black text-white" type="submit">
              筛选
            </button>
          </form>
        }
      >
        <AdminTable<AdminOperationRequest>
          rows={requests.rows}
          rowKey={(row) => row.id}
          empty="暂无审批单"
          columns={[
            {
              key: "request",
              label: "审批单",
              render: (row) => (
                <div className="min-w-[220px]">
                  <div className="flex items-center gap-2">
                    <AdminStatusBadge status={row.status} />
                    <RiskBadge risk={row.riskLevel} />
                  </div>
                  <p className="mt-1 text-sm font-black text-[var(--admin-fg)]">{operationTypeLabel(row.requestType)}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--admin-faint)]">{shortAdminCode(row.id, "单号")}</p>
                </div>
              ),
            },
            {
              key: "target",
              label: "处理对象",
              render: (row) => (
                <div className="min-w-[220px]">
                  <p className="text-sm font-bold text-[var(--admin-fg)]">{resourceTypeLabel(row.targetType)}（{shortAdminCode(row.targetId, "")}）</p>
                  <p className="mt-1 text-xs text-[var(--admin-muted)]">
                    补偿灵点：<span className="font-black text-[var(--admin-fg)]">{formatNumber(Number(row.payload.amount || 0))}</span>
                  </p>
                </div>
              ),
            },
            { key: "reason", label: "原因", render: (row) => <p className="max-w-[320px] text-xs leading-5 text-[var(--admin-muted)]">{row.reason}</p> },
            { key: "requester", label: "申请人", render: (row) => <span className="text-xs font-bold text-[var(--admin-fg)]">{row.requestedByEmail || row.requestedBy || "-"}</span> },
            { key: "approver", label: "审批人", render: (row) => <span className="text-xs font-bold text-[var(--admin-fg)]">{row.approvedByEmail || row.approvedBy || "-"}</span> },
            { key: "created", label: "创建", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-[var(--admin-muted)]">{formatDateTime(row.createdAt)}</span> },
            { key: "actions", label: "操作", render: (row) => <AdminOperationRequestActions id={row.id} status={row.status} /> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function RiskBadge({ risk }: { risk: AdminOperationRequest["riskLevel"] }) {
  const className = risk === "high"
    ? "bg-[var(--admin-danger-soft)] text-[var(--admin-danger)] border-[var(--admin-danger-border)]"
    : risk === "medium"
      ? "bg-[var(--admin-warning-soft)] text-[var(--admin-warning)] border-[var(--admin-warning-border)]"
      : "bg-[var(--admin-success-soft)] text-[var(--admin-success)] border-[var(--admin-success-border)]";
  const label = risk === "high" ? "高风险" : risk === "medium" ? "中风险" : "低风险";
  return <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-black ${className}`}>{label}</span>;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
