import Link from "next/link";
import { FlaskConical, RefreshCw, Search, Settings2 } from "lucide-react";
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
import { AdminWorkerRunForm } from "@/components/admin/AdminWorkerRunForm";
import {
  getAdminAgentEvalOverview,
  type AdminAgentEvalCase,
  type AdminAgentEvalResult,
  type AdminAgentEvalRun,
} from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminEvalsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const overview = await getAdminAgentEvalOverview({ q, limit: 80 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Agent Evals"
        title="Agent Eval 管理"
        description="集中查看 Agent brain 回归评估、失败 case、worker secret 健康和手动触发记录。用于上线前门禁、坏反馈沉淀和 prompt/决策链路回归。"
        actions={
          <>
            <Link
              href="/admin/evals"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              刷新
            </Link>
            <Link
              href="/admin/workers"
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Worker
            </Link>
          </>
        }
      />

      {!overview.available && (
        <AdminNotice>
          agent_eval_runs / agent_eval_results 表尚未可用。先执行 supabase/agent-brain-traces.sql 后，后台会展示真实 eval 运行记录。
        </AdminNotice>
      )}
      {!overview.processor.configured && (
        <AdminNotice tone="danger">
          Agent eval worker secret 未配置，/api/jobs/run-agent-evals 和后台手动触发会被拒绝。候选环境变量：{overview.processor.secretNames.join("、")}。
        </AdminNotice>
      )}
      {overview.warnings.length > 0 && (
        <AdminNotice tone="info">
          Eval 数据源提示：{overview.warnings.slice(0, 3).join("；")}
        </AdminNotice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <AdminMetricCard label="总运行" value={formatNumber(overview.metrics.totalRuns)} hint={formatDateTime(overview.metrics.latestRunAt)} />
        <AdminMetricCard label="近期待看" value={formatNumber(overview.metrics.recentRuns)} />
        <AdminMetricCard label="平均分" value={overview.metrics.avgScore} suffix="分" tone={overview.metrics.avgScore >= 90 ? "good" : overview.metrics.avgScore >= 70 ? "warning" : "danger"} />
        <AdminMetricCard label="通过率" value={overview.metrics.passRate} suffix="%" tone={overview.metrics.passRate >= 90 ? "good" : overview.metrics.passRate >= 70 ? "warning" : "danger"} />
        <AdminMetricCard label="失败运行" value={formatNumber(overview.metrics.failedRuns)} tone={overview.metrics.failedRuns > 0 ? "danger" : "good"} />
        <AdminMetricCard label="平均耗时" value={formatLatency(overview.metrics.averageLatencyMs)} />
      </div>

      <AdminSection title="筛选" description="按 run ID、用户、邮箱、状态、case 标题或失败原因快速定位回归问题。">
        <form action="/admin/evals" className="grid gap-3 p-4 sm:grid-cols-[minmax(260px,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              name="q"
              defaultValue={q}
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-slate-400"
              placeholder="搜索 run、user、case、failure"
            />
          </label>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-black text-white">
            <Search className="h-4 w-4" />
            查询
          </button>
        </form>
      </AdminSection>

      <AdminSection title="手动触发 Agent Eval" description="用于上线前回归、prompt 改动后复测或坏反馈沉淀验证。触发会写入 admin_audit_logs。">
        <AdminWorkerRunForm defaultTarget="agent-evals" defaultLimit={overview.processor.batchSize} defaultReason="Agent eval 回归验证" lockTarget />
      </AdminSection>

      <AdminSection title="Worker 配置" description="只展示 secret 是否可用和候选变量名，不展示明文 secret。">
        <div className="grid gap-3 p-4 md:grid-cols-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-500">Endpoint</p>
            <code className="mt-2 block break-all text-xs font-bold text-slate-700">{overview.processor.endpoint}</code>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-500">默认批量</p>
            <p className="mt-2 font-mono text-xl font-black text-slate-950">{overview.processor.batchSize}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-500">Secret</p>
            <div className="mt-2"><AdminStatusBadge status={overview.processor.configured ? "pass" : "failed"} /></div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs font-black text-slate-500">候选变量</p>
            <div className="mt-2 flex flex-wrap gap-1">
              {overview.processor.secretNames.map((name) => (
                <code key={name} className="rounded bg-white px-1.5 py-1 text-[11px] font-bold text-slate-600">{name}</code>
              ))}
            </div>
          </div>
        </div>
      </AdminSection>

      <AdminSection title="最近 Eval 运行" description="按创建时间倒序展示。分数低或 total=0 的运行优先进入回归排查。">
        <AdminTable<AdminAgentEvalRun>
          rows={overview.runs}
          rowKey={(row) => row.id}
          empty="暂无 eval 运行记录"
          columns={[
            { key: "status", label: "状态", render: (row) => <AdminStatusBadge status={row.status} /> },
            {
              key: "run",
              label: "Run",
              render: (row) => (
                <div className="min-w-[220px]">
                  <p className="font-mono text-xs font-black text-slate-700">{row.id}</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</p>
                </div>
              ),
            },
            {
              key: "user",
              label: "用户",
              render: (row) => (
                <div className="min-w-[180px]">
                  <p className="truncate text-xs font-bold text-slate-700">{row.email || row.userId || "-"}</p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.userId}</p>
                </div>
              ),
            },
            { key: "score", label: "分数", render: (row) => <span className="font-mono text-sm font-black text-slate-950">{row.score}</span> },
            { key: "cases", label: "用例", render: (row) => <span className="font-mono text-xs font-bold text-slate-600">{row.passed}/{row.total}</span> },
            { key: "failed", label: "失败", render: (row) => <span className="font-mono text-xs font-bold text-red-600">{row.failed}</span> },
            { key: "latency", label: "耗时", render: (row) => <span className="font-mono text-xs font-bold text-slate-600">{formatLatency(row.latencyMs)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="失败 Case" description="来自 agent_eval_results.ok=false，可直接定位失败期望、实际 action/module 和 trace。">
        <AdminTable<AdminAgentEvalResult>
          rows={overview.failures}
          rowKey={(row) => row.id}
          empty="暂无失败 case"
          columns={[
            {
              key: "case",
              label: "Case",
              render: (row) => (
                <div className="min-w-[260px]">
                  <p className="text-sm font-black text-slate-950">{row.title || row.caseId}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">{row.caseId}</p>
                </div>
              ),
            },
            { key: "actual", label: "实际", render: (row) => <span className="whitespace-nowrap font-mono text-xs font-bold text-slate-700">{row.action || "-"} / {row.module || "none"}</span> },
            { key: "confidence", label: "置信度", render: (row) => <span className="font-mono text-xs font-bold text-slate-600">{Math.round(row.confidence * 100)}%</span> },
            { key: "failure", label: "失败原因", render: (row) => <p className="max-w-[420px] text-xs leading-5 text-slate-600">{row.failures.slice(0, 3).join("；") || "-"}</p> },
            { key: "trace", label: "Trace", render: (row) => <code className="text-[11px] font-bold text-slate-500">{row.traceId || "-"}</code> },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="内置基线用例" description="来自代码中的 BRAIN_EVAL_CASES。坏反馈沉淀用例会在运行时追加，不污染基线定义。">
        <AdminTable<AdminAgentEvalCase>
          rows={overview.baselineCases}
          rowKey={(row) => row.id}
          empty="暂无基线用例"
          columns={[
            {
              key: "case",
              label: "Case",
              render: (row) => (
                <div className="min-w-[260px]">
                  <p className="text-sm font-black text-slate-950">{row.title}</p>
                  <p className="mt-0.5 font-mono text-[11px] text-slate-400">{row.id}</p>
                </div>
              ),
            },
            { key: "expected", label: "期望", render: (row) => <p className="max-w-[420px] text-xs font-semibold text-slate-600">{row.expected.join("；") || "-"}</p> },
            { key: "images", label: "图片", render: (row) => <span className="font-mono text-xs font-black text-slate-600">{row.imageCount}</span> },
          ]}
        />
      </AdminSection>

      <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm leading-6 text-blue-700">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          上线建议：prompt、Agent brain 或 safety guard 改动后先在此页触发回归；若失败 case 非 0，进入 trace 和坏反馈沉淀后再发生产 tag。
        </p>
      </div>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatLatency(value: number) {
  if (!value) return "-";
  if (value >= 1000) return `${Math.round(value / 100) / 10}s`;
  return `${value}ms`;
}
