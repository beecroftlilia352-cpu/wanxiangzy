import Link from "next/link";
import { Filter, Search } from "lucide-react";
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
import { AdminTaskActions } from "@/components/admin/AdminTaskActions";
import { listAdminTasks, type AdminTaskListItem } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const statusOptions = [
  { value: "", label: "全部状态" },
  { value: "queued", label: "排队中" },
  { value: "running", label: "运行中" },
  { value: "completed", label: "已完成" },
  { value: "failed", label: "失败" },
];

const moduleOptions = [
  { value: "", label: "全部模块" },
  { value: "tryon", label: "服装上身" },
  { value: "pose", label: "姿势裂变" },
  { value: "model", label: "专属模特" },
  { value: "modelBackground", label: "模特换背景" },
  { value: "grass", label: "种草图" },
  { value: "productSet", label: "商品套图" },
  { value: "garment3d", label: "服装 3D" },
  { value: "faceSwap", label: "换脸" },
  { value: "workflow", label: "Agent 工作流" },
];

export default async function AdminGenerationsPage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const status = getSearchParam(params.status);
  const module = getSearchParam(params.module);
  const stale = getSearchParam(params.stale) === "1";
  const tasks = await listAdminTasks({ q, status, module, stale, limit: 60 });
  const failed = tasks.rows.filter((row) => row.statusGroup === "failed").length;
  const running = tasks.rows.filter((row) => row.statusGroup === "running" || row.statusGroup === "queued").length;
  const staleCount = tasks.rows.filter((row) => row.isStale).length;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Tasks"
        title="任务中心"
        description="统一查看 generation 与 Agent workflow；支持对卡住任务重新入队、标记失败、取消并退款。"
        actions={
          <Link
            href="/api/jobs/process-generations"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <Filter className="h-3.5 w-3.5" />
            Processor endpoint
          </Link>
        }
      />

      {tasks.warnings.length > 0 && <AdminNotice>任务 read model 提示：{tasks.warnings.slice(0, 3).join("；")}</AdminNotice>}
      {tasks.source === "fallback" && (
        <AdminNotice tone="info">
          当前 task_queue_items 不可用，已回退读取 generations / agent_workflows。建议上线前执行 supabase/task-queue-items.sql。
        </AdminNotice>
      )}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">当前列表</p>
          <p className="mt-3 text-2xl font-black text-slate-950">{formatNumber(tasks.rows.length)}</p>
        </div>
        <div className="rounded-lg border border-amber-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">排队/运行</p>
          <p className="mt-3 text-2xl font-black text-amber-700">{formatNumber(running)}</p>
        </div>
        <div className="rounded-lg border border-red-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">失败</p>
          <p className="mt-3 text-2xl font-black text-red-700">{formatNumber(failed)}</p>
        </div>
        <div className="rounded-lg border border-orange-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.1em] text-slate-400">卡住</p>
          <p className="mt-3 text-2xl font-black text-orange-700">{formatNumber(staleCount)}</p>
        </div>
      </div>

      <AdminSection
        title="任务列表"
        description="支持按模块、状态、ID、标题、用户和错误信息筛选。"
        actions={
          <form action="/admin/generations" className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索任务 / 用户 / 错误"
                className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm font-semibold outline-none focus:border-slate-400"
              />
            </div>
            <select name="module" defaultValue={module} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700">
              {moduleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <select name="status" defaultValue={status} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700">
              {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 text-xs font-black text-slate-700">
              <input name="stale" value="1" type="checkbox" defaultChecked={stale} className="h-3.5 w-3.5 rounded border-slate-300" />
              只看卡住
            </label>
            <button className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white" type="submit">
              筛选
            </button>
          </form>
        }
      >
        <AdminTable<AdminTaskListItem>
          rows={tasks.rows}
          rowKey={(row) => `${row.sourceType}:${row.sourceId}`}
          empty="暂无任务"
          columns={[
            {
              key: "task",
              label: "任务",
              render: (row) => (
                <div className="min-w-[260px]">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminStatusBadge status={row.status} group={row.statusGroup} />
                    <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-black text-slate-500">{row.sourceType}</span>
                  </div>
                  <Link href={`/admin/generations/${row.sourceId}`} className="mt-1 block truncate text-sm font-black text-slate-950 hover:underline">
                    {row.title}
                  </Link>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{row.sourceId}</p>
                </div>
              ),
            },
            {
              key: "thumbs",
              label: "缩略图",
              render: (row) => <ThumbnailStrip urls={row.resultThumbnails.length ? row.resultThumbnails : row.inputThumbnails} />,
            },
            {
              key: "module",
              label: "模块",
              render: (row) => <span className="whitespace-nowrap text-sm font-bold text-slate-700">{row.moduleLabel}</span>,
            },
            {
              key: "progress",
              label: "进度",
              render: (row) => (
                <div className="min-w-24">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-slate-900" style={{ width: `${Math.max(0, Math.min(row.progress, 100))}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-xs font-black text-slate-600">{row.progress}%</p>
                </div>
              ),
            },
            {
              key: "count",
              label: "结果",
              render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{row.resultCount}/{row.expectedCount}</span>,
            },
            {
              key: "model",
              label: "模型",
              render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{row.model || "-"}</span>,
            },
            {
              key: "stale",
              label: "卡住",
              render: (row) => (
                <span className={`whitespace-nowrap text-xs font-black ${row.isStale ? "text-orange-700" : "text-slate-400"}`}>
                  {row.isStale ? `${row.staleMinutes} 分钟` : "-"}
                </span>
              ),
            },
            {
              key: "created",
              label: "创建",
              render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.createdAt)}</span>,
            },
            {
              key: "actions",
              label: "操作",
              render: (row) => (
                <AdminTaskActions
                  id={row.sourceId}
                  sourceType={row.sourceType}
                  statusGroup={row.statusGroup}
                  isStale={row.isStale}
                  compact
                />
              ),
            },
            {
              key: "error",
              label: "错误",
              className: "max-w-[260px]",
              render: (row) => row.errorMessage
                ? <span className="line-clamp-2 text-xs font-semibold text-red-600">{row.errorMessage}</span>
                : <span className="text-xs font-semibold text-slate-400">-</span>,
            },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
