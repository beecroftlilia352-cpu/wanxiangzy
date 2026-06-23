import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, RefreshCw } from "lucide-react";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminTable,
  formatDateTime,
  formatNumber,
} from "@/components/admin/AdminPrimitives";
import { getAdminDiagnostics, type AdminDiagnosticItem, type AdminDiagnosticSeverity } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminDiagnosticsPage() {
  const report = await getAdminDiagnostics();
  const launchChecks = buildLaunchChecks(report.items, report.summary.critical, report.summary.warning);

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Diagnostics"
        title="异常诊断建议"
        description="自动汇总队列、处理服务、模型通道、财务、审核和审批信号，给出可执行的排障建议。"
        actions={
          <Link
            href="/admin/diagnostics"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-3 text-xs font-black text-[var(--admin-fg)] shadow-sm hover:bg-[var(--admin-surface-soft)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            刷新
          </Link>
        }
      />

      {report.warnings.length > 0 && (
        <AdminNotice tone="info">
          诊断数据源提示：{report.warnings.slice(0, 3).join("；")}
        </AdminNotice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard label="诊断项" value={formatNumber(report.summary.total)} hint={formatDateTime(report.generatedAt)} />
        <AdminMetricCard label="严重" value={formatNumber(report.summary.critical)} tone={report.summary.critical > 0 ? "danger" : "good"} />
        <AdminMetricCard label="预警" value={formatNumber(report.summary.warning)} tone={report.summary.warning > 0 ? "warning" : "good"} />
        <AdminMetricCard label="提示" value={formatNumber(report.summary.info)} />
        <AdminMetricCard
          label="状态"
          value={report.summary.critical > 0 ? "需处理" : report.summary.warning > 0 ? "需关注" : "健康"}
          tone={report.summary.critical > 0 ? "danger" : report.summary.warning > 0 ? "warning" : "good"}
        />
      </div>

      <AdminSection title="上线检查" description="面向上线前最后确认：严重项必须处理，预警项需要负责人确认，暂缓项不阻塞本次上线。">
        <div className="grid gap-3 p-4 lg:grid-cols-3">
          {launchChecks.map((check) => (
            <LaunchCheckCard key={check.title} check={check} />
          ))}
        </div>
      </AdminSection>

      {report.items.length === 0 ? (
        <section className="rounded-lg border border-[var(--admin-success-border)] bg-[var(--admin-success-soft)] p-8 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-[var(--admin-success)]" />
          <h2 className="mt-3 text-lg font-black text-emerald-900">当前没有需要处理的异常</h2>
          <p className="mt-2 text-sm font-semibold text-[var(--admin-success)]">队列、处理服务、审核、审批和近 7 天财务信号没有触发诊断规则。</p>
        </section>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {report.items.map((item) => (
            <DiagnosticCard key={item.id} item={item} />
          ))}
        </div>
      )}

      <AdminSection title="诊断明细" description="同一批诊断结果的表格视图，方便导出或截图给值班同事。">
        <AdminTable<AdminDiagnosticItem>
          rows={report.items}
          rowKey={(row) => row.id}
          empty="暂无诊断项"
          columns={[
            {
              key: "severity",
              label: "级别",
              render: (row) => <SeverityBadge severity={row.severity} />,
            },
            {
              key: "item",
              label: "诊断项",
              render: (row) => (
                <div className="min-w-[240px]">
                  <p className="text-sm font-black text-[var(--admin-fg)]">{row.title}</p>
                  <p className="mt-1 text-xs font-semibold text-[var(--admin-muted)]">{row.summary}</p>
                </div>
              ),
            },
            { key: "category", label: "分类", render: (row) => <span className="text-xs font-black text-[var(--admin-fg)]">{categoryLabel(row.category)}</span> },
            { key: "impact", label: "影响", render: (row) => <p className="max-w-[320px] text-xs leading-5 text-[var(--admin-muted)]">{row.impact}</p> },
            { key: "recommendation", label: "建议", render: (row) => <p className="max-w-[360px] text-xs leading-5 text-[var(--admin-fg)]">{row.recommendation}</p> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function DiagnosticCard({ item }: { item: AdminDiagnosticItem }) {
  return (
    <section className={`rounded-lg border bg-[var(--admin-surface)] p-4 shadow-sm ${severityBorder(item.severity)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={item.severity} />
            <span className="rounded-md bg-[var(--admin-surface-soft)] px-2 py-1 text-[11px] font-black text-[var(--admin-fg)]">
              {categoryLabel(item.category)}
            </span>
          </div>
          <h2 className="mt-3 text-base font-black text-[var(--admin-fg)]">{item.title}</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--admin-fg)]">{item.summary}</p>
        </div>
        {item.severity === "info" ? <Info className="h-5 w-5 shrink-0 text-[var(--admin-info)]" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--admin-warning)]" />}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-[var(--admin-surface-soft)] p-3">
          <p className="text-xs font-black text-[var(--admin-muted)]">影响</p>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-fg)]">{item.impact}</p>
        </div>
        <div className="rounded-lg bg-[var(--admin-surface-soft)] p-3">
          <p className="text-xs font-black text-[var(--admin-muted)]">建议</p>
          <p className="mt-1 text-xs leading-5 text-[var(--admin-fg)]">{item.recommendation}</p>
        </div>
      </div>

      {item.evidence.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.evidence.slice(0, 8).map((entry) => (
            <span key={`${item.id}-${entry.label}`} className="rounded-md border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 py-1 text-xs font-bold text-[var(--admin-fg)]">
              {entry.label}: <span className="font-mono text-[var(--admin-fg)]">{String(entry.value)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {item.links.map((link) => (
          <Link
            key={`${item.id}-${link.href}`}
            href={link.href}
            className="inline-flex h-8 items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)]"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

type LaunchCheck = {
  title: string;
  status: "pass" | "attention" | "blocked" | "deferred";
  description: string;
  action: string;
  href?: string;
};

function buildLaunchChecks(items: AdminDiagnosticItem[], critical: number, warning: number): LaunchCheck[] {
  const itemById = new Map(items.map((item) => [item.id, item]));
  const queueIssue = maxStatus([itemById.get("queue-stale"), itemById.get("queue-backlog"), itemById.get("worker-secret-missing")]);
  const contentIssue = maxStatus([itemById.get("moderation-pending"), itemById.get("operation-requests-pending")]);
  const financeIssue = maxStatus([itemById.get("refund-ratio")]);
  const dataIssue = maxStatus([itemById.get("admin-data-warnings"), itemById.get("provider-config-missing")]);

  return [
    {
      title: "上线门槛",
      status: critical > 0 ? "blocked" : warning > 0 ? "attention" : "pass",
      description: critical > 0 ? `还有 ${critical} 个严重问题，建议暂缓上线。` : warning > 0 ? `还有 ${warning} 个预警项，需要负责人确认。` : "当前没有严重或预警诊断项。",
      action: critical > 0 ? "先处理严重项" : warning > 0 ? "确认预警处置方案" : "可进入上线确认",
      href: "/admin/diagnostics",
    },
    {
      title: "任务处理闭环",
      status: queueIssue,
      description: queueIssue === "pass" ? "队列、长时间未完成任务和处理服务配置未触发异常。" : "队列或处理服务存在需要处理的异常。",
      action: "查看任务队列",
      href: "/admin/workers",
    },
    {
      title: "财务补偿闭环",
      status: financeIssue,
      description: financeIssue === "pass" ? "近 7 天退款占比未触发预警。" : "退款占比偏高，需要核对失败模块和补偿原因。",
      action: "查看成本报表",
      href: "/admin/reports?days=7",
    },
    {
      title: "审核审批闭环",
      status: contentIssue,
      description: contentIssue === "pass" ? "内容审核和高危审批没有积压预警。" : "审核或审批存在积压，需要上线前清理。",
      action: "查看审批中心",
      href: "/admin/requests?status=pending",
    },
    {
      title: "数据初始化",
      status: dataIssue,
      description: dataIssue === "pass" ? "后台数据源没有初始化提示。" : "存在数据源或模型通道提示，上线前需确认是否影响运营。",
      action: "查看配置与诊断",
      href: "/admin/settings",
    },
    {
      title: "客服模块",
      status: "deferred",
      description: "按当前计划暂缓，不作为本次上线阻塞项。",
      action: "二阶段补齐客服前端",
      href: "/admin/support",
    },
  ];
}

function maxStatus(items: Array<AdminDiagnosticItem | undefined>): LaunchCheck["status"] {
  if (items.some((item) => item?.severity === "critical")) return "blocked";
  if (items.some((item) => item?.severity === "warning" || item?.severity === "info")) return "attention";
  return "pass";
}

function LaunchCheckCard({ check }: { check: LaunchCheck }) {
  const className = {
    pass: "border-[var(--admin-success-border)] bg-[var(--admin-success-soft)]",
    attention: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)]",
    blocked: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)]",
    deferred: "border-[var(--admin-border)] bg-[var(--admin-surface-soft)]",
  }[check.status];
  const label = {
    pass: "可上线",
    attention: "需确认",
    blocked: "先处理",
    deferred: "暂缓",
  }[check.status];
  const labelClassName = {
    pass: "border-[var(--admin-success-border)] bg-[var(--admin-surface)] text-[var(--admin-success)]",
    attention: "border-[var(--admin-warning-border)] bg-[var(--admin-surface)] text-[var(--admin-warning)]",
    blocked: "border-[var(--admin-danger-border)] bg-[var(--admin-surface)] text-[var(--admin-danger)]",
    deferred: "border-[var(--admin-border)] bg-[var(--admin-surface)] text-[var(--admin-fg)]",
  }[check.status];

  return (
    <section className={`rounded-lg border p-4 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-[var(--admin-fg)]">{check.title}</h2>
        <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-black ${labelClassName}`}>{label}</span>
      </div>
      <p className="mt-2 min-h-10 text-xs leading-5 text-[var(--admin-fg)]">{check.description}</p>
      {check.href ? (
        <Link href={check.href} className="mt-3 inline-flex h-8 items-center rounded-lg border border-[var(--admin-border)] bg-[var(--admin-surface)] px-2 text-xs font-black text-[var(--admin-fg)] hover:bg-[var(--admin-surface-soft)]">
          {check.action}
        </Link>
      ) : (
        <p className="mt-3 text-xs font-black text-[var(--admin-fg)]">{check.action}</p>
      )}
    </section>
  );
}

function categoryLabel(category: string) {
  if (category === "queue") return "任务队列";
  if (category === "worker") return "处理服务";
  if (category === "provider") return "模型通道";
  if (category === "content") return "内容审核";
  if (category === "approval") return "审批";
  if (category === "finance") return "财务";
  if (category === "data") return "数据源";
  return category;
}

function SeverityBadge({ severity }: { severity: AdminDiagnosticSeverity }) {
  const className = {
    critical: "border-[var(--admin-danger-border)] bg-[var(--admin-danger-soft)] text-[var(--admin-danger)]",
    warning: "border-[var(--admin-warning-border)] bg-[var(--admin-warning-soft)] text-[var(--admin-warning)]",
    info: "border-[var(--admin-info-border)] bg-[var(--admin-info-soft)] text-[var(--admin-info)]",
  }[severity];
  const label = severity === "critical" ? "严重" : severity === "warning" ? "预警" : "提示";

  return (
    <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-black leading-none ${className}`}>
      {label}
    </span>
  );
}

function severityBorder(severity: AdminDiagnosticSeverity) {
  if (severity === "critical") return "border-[var(--admin-danger-border)]";
  if (severity === "warning") return "border-[var(--admin-warning-border)]";
  return "border-[var(--admin-info-border)]";
}
