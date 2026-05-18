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

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Diagnostics"
        title="异常诊断建议"
        description="自动汇总队列、worker、provider、财务、审核和审批信号，给出可执行的排障建议。当前为规则引擎版，后续可以接入告警和 LLM 诊断。"
        actions={
          <Link
            href="/admin/diagnostics"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
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

      {report.items.length === 0 ? (
        <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-8 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-700" />
          <h2 className="mt-3 text-lg font-black text-emerald-900">当前没有需要处理的异常</h2>
          <p className="mt-2 text-sm font-semibold text-emerald-700">队列、worker、审核、审批和近 7 天财务信号没有触发诊断规则。</p>
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
                  <p className="text-sm font-black text-slate-950">{row.title}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{row.summary}</p>
                </div>
              ),
            },
            { key: "category", label: "分类", render: (row) => <span className="font-mono text-xs font-black text-slate-600">{row.category}</span> },
            { key: "impact", label: "影响", render: (row) => <p className="max-w-[320px] text-xs leading-5 text-slate-500">{row.impact}</p> },
            { key: "recommendation", label: "建议", render: (row) => <p className="max-w-[360px] text-xs leading-5 text-slate-600">{row.recommendation}</p> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function DiagnosticCard({ item }: { item: AdminDiagnosticItem }) {
  return (
    <section className={`rounded-lg border bg-white p-4 shadow-sm ${severityBorder(item.severity)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={item.severity} />
            <span className="rounded-md bg-slate-100 px-2 py-1 font-mono text-[11px] font-black text-slate-600">
              {item.category}
            </span>
          </div>
          <h2 className="mt-3 text-base font-black text-slate-950">{item.title}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{item.summary}</p>
        </div>
        {item.severity === "info" ? <Info className="h-5 w-5 shrink-0 text-blue-600" /> : <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-black text-slate-500">影响</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">{item.impact}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-black text-slate-500">建议</p>
          <p className="mt-1 text-xs leading-5 text-slate-700">{item.recommendation}</p>
        </div>
      </div>

      {item.evidence.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {item.evidence.slice(0, 8).map((entry) => (
            <span key={`${item.id}-${entry.label}`} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">
              {entry.label}: <span className="font-mono text-slate-950">{String(entry.value)}</span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {item.links.map((link) => (
          <Link
            key={`${item.id}-${link.href}`}
            href={link.href}
            className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700 hover:bg-slate-50"
          >
            {link.label}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SeverityBadge({ severity }: { severity: AdminDiagnosticSeverity }) {
  const className = {
    critical: "border-red-200 bg-red-50 text-red-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    info: "border-blue-200 bg-blue-50 text-blue-700",
  }[severity];
  const label = severity === "critical" ? "严重" : severity === "warning" ? "预警" : "提示";

  return (
    <span className={`inline-flex h-6 items-center rounded-md border px-2 text-[11px] font-black leading-none ${className}`}>
      {label}
    </span>
  );
}

function severityBorder(severity: AdminDiagnosticSeverity) {
  if (severity === "critical") return "border-red-200";
  if (severity === "warning") return "border-amber-200";
  return "border-blue-200";
}
