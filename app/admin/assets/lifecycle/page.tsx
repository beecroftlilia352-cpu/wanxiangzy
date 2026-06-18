import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import {
  AdminMetricCard,
  AdminNotice,
  AdminPageHeader,
  AdminSection,
  AdminStatusBadge,
  AdminTable,
  ThumbnailStrip,
  formatDateTime,
  formatNumber,
  resourceTypeLabel,
  shortAdminCode,
} from "@/components/admin/AdminPrimitives";
import { AdminAssetLifecyclePlanForm } from "@/components/admin/AdminAssetLifecyclePlanForm";
import {
  getAdminAssetLifecycleOverview,
  type AdminAssetLifecycleItem,
  type AdminAssetLifecyclePolicy,
} from "@/lib/admin/data";
import type { TaskStatusGroup } from "@/lib/task-queue";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const moduleOptions = [
  { value: "", label: "全部资产" },
  { value: "tryon", label: "服装上身" },
  { value: "pose", label: "姿势裂变" },
  { value: "model", label: "专属模特" },
  { value: "modelBackground", label: "模特换背景" },
  { value: "grass", label: "种草图" },
  { value: "productSet", label: "商品套图" },
  { value: "garment3d", label: "服装 3D" },
  { value: "faceSwap", label: "换脸" },
];

export default async function AdminAssetLifecyclePage({ searchParams }: PageProps) {
  const params = (await searchParams) || {};
  const q = getSearchParam(params.q);
  const moduleFilter = getSearchParam(params.module);
  const overview = await getAdminAssetLifecycleOverview({ q, module: moduleFilter, limit: q || moduleFilter ? 120 : 70 });

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Asset Lifecycle"
        title="素材生命周期与批量迁移"
        description="统一识别 OSS、ImgBB、外部 URL、临时输入图、收藏素材和审核下架结果；V1 先创建可审计计划，真实迁移/删除由后续异步 worker 执行。"
        actions={
          <Link
            href="/admin/assets"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            返回资产
          </Link>
        }
      />

      {overview.warnings.length > 0 && (
        <AdminNotice tone="info">数据源提示：{overview.warnings.slice(0, 3).join("；")}</AdminNotice>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard label="采样资产" value={formatNumber(overview.metrics.sampledAssets)} hint="本页最多采样 120 条最近资产" />
        <AdminMetricCard label="迁移候选" value={formatNumber(overview.metrics.migrationCandidates)} hint="ImgBB、外部或未知来源" tone={overview.metrics.migrationCandidates ? "warning" : "good"} />
        <AdminMetricCard label="归档候选" value={formatNumber(overview.metrics.archiveCandidates)} hint="历史生成图或已下架素材" tone={overview.metrics.archiveCandidates ? "warning" : "neutral"} />
        <AdminMetricCard label="保护资产" value={formatNumber(overview.metrics.protectedAssets)} hint="收藏方案与参考图默认保留" />
        <AdminMetricCard label="复核候选" value={formatNumber(overview.metrics.reviewCandidates)} hint="超过 30 天的输入图" tone={overview.metrics.reviewCandidates ? "warning" : "good"} />
      </div>

      <AdminSection
        title="筛选"
        description="筛选条件会同步用于生命周期计划，便于运营分批处理不同模块。"
        actions={
          <form action="/admin/assets/lifecycle" className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={q}
                placeholder="搜索资产 / 用户 / 状态"
                className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-sm font-semibold outline-none focus:border-slate-400"
              />
            </div>
            <select name="module" defaultValue={moduleFilter} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700">
              {moduleOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
            <button className="h-9 rounded-lg bg-slate-950 px-3 text-xs font-black text-white" type="submit">
              筛选
            </button>
          </form>
        }
      >
        <div className="grid gap-3 p-4 text-xs font-semibold text-slate-600 md:grid-cols-5">
          <StorageCount label="OSS URL" value={overview.metrics.ossUrls} />
          <StorageCount label="ImgBB URL" value={overview.metrics.imgbbUrls} />
          <StorageCount label="外部 URL" value={overview.metrics.externalUrls} />
          <StorageCount label="Data URL" value={overview.metrics.dataUrls} />
          <StorageCount label="未知 URL" value={overview.metrics.unknownUrls} />
        </div>
      </AdminSection>

      <AdminSection
        title="创建生命周期计划"
        description="当前只写审计计划，不会立即改动存储对象；后续可以把相同 action 接入队列 worker。"
      >
        <AdminAssetLifecyclePlanForm q={q} module={moduleFilter} limit={120} />
      </AdminSection>

      <AdminSection title="生命周期策略" description="策略来自后台规则，后续可升级为配置版本和审批发布。">
        <AdminTable<AdminAssetLifecyclePolicy>
          rows={overview.policies}
          rowKey={(row) => row.id}
          empty="暂无策略"
          columns={[
            {
              key: "policy",
              label: "策略",
              render: (row) => (
                <div className="min-w-[260px]">
                  <AdminStatusBadge status={row.stage} />
                  <p className="mt-1 text-sm font-black text-slate-950">{row.title}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-500">{row.description}</p>
                </div>
              ),
            },
            { key: "threshold", label: "阈值", render: (row) => <code className="text-xs text-slate-500">{row.threshold}</code> },
            { key: "action", label: "建议动作", render: (row) => <span className="text-xs font-black text-slate-700">{lifecycleActionLabel(row.action)}</span> },
          ]}
        />
      </AdminSection>

      <AdminSection title="候选资产" description="按推荐动作和风险排序；执行前需要先看引用和审核影响。">
        <AdminTable<AdminAssetLifecycleItem>
          rows={overview.rows}
          rowKey={(row) => `${row.sourceType}:${row.id}`}
          empty="暂无候选资产"
          columns={[
            {
              key: "preview",
              label: "预览",
              render: (row) => <ThumbnailStrip urls={row.urls.length ? row.urls : row.inputUrls} />,
            },
            {
              key: "asset",
              label: "资产",
              render: (row) => (
                <div className="min-w-[260px]">
                  <div className="flex items-center gap-2">
                    <AdminStatusBadge status={row.stage} group={stageGroup(row.stage, row.riskLevel)} />
                    <span className="rounded-md bg-slate-100 px-1.5 py-1 text-[10px] font-black text-slate-500">{resourceTypeLabel(row.sourceType)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm font-black text-slate-950">{row.title}</p>
                  <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-400">{shortAdminCode(row.id, "资产")}</p>
                </div>
              ),
            },
            { key: "module", label: "模块", render: (row) => <span className="whitespace-nowrap text-sm font-bold text-slate-700">{row.moduleLabel}</span> },
            {
              key: "storage",
              label: "存储",
              render: (row) => (
                <div className="flex min-w-[170px] flex-wrap gap-1.5">
                  {row.providers.map((provider) => (
                    <span key={provider} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] font-black text-slate-600">
                      {provider}
                    </span>
                  ))}
                </div>
              ),
            },
            { key: "count", label: "图片", render: (row) => <span className="font-mono text-sm font-bold text-slate-700">{row.urlCount}/{row.inputCount}</span> },
            { key: "age", label: "保存时长", render: (row) => <span className="text-sm font-bold text-slate-700">{row.ageDays} 天</span> },
            {
              key: "action",
              label: "建议",
              render: (row) => (
                <div className="min-w-[240px]">
                  <p className="text-xs font-black text-slate-700">{lifecycleActionLabel(row.recommendedAction)}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{row.reasons.join("；")}</p>
                </div>
              ),
            },
            { key: "time", label: "时间", render: (row) => <span className="whitespace-nowrap text-xs font-semibold text-slate-500">{formatDateTime(row.updatedAt || row.createdAt)}</span> },
          ]}
        />
      </AdminSection>
    </div>
  );
}

function StorageCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-slate-500">{label}</span>
      <span className="ml-2 font-mono font-black text-slate-950">{formatNumber(value)}</span>
    </div>
  );
}

function stageGroup(stage: string, riskLevel: string): TaskStatusGroup {
  if (riskLevel === "high" || stage === "archive") return "failed";
  if (stage === "migrate" || stage === "review") return "queued";
  if (stage === "protected") return "completed";
  return "running";
}

function lifecycleActionLabel(action: string) {
  if (action === "retain") return "继续保留";
  if (action === "migrate_to_oss") return "迁移到长期存储";
  if (action === "review_temp_inputs") return "人工复核临时素材";
  if (action === "archive_generated_result") return "归档生成结果";
  if (action === "freeze_and_hide") return "冻结并下架";
  return action;
}

function getSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}
