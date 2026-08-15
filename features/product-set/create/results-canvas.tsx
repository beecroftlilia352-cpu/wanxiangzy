import { Download, Loader2, RefreshCw, X, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { PreviewGuide } from "@/components/PreviewGuide";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { ModuleProgressList, QualityBadge } from "@/features/product-set/create/analysis-sections";
import { getAspectRatioLabel, PRODUCT_SET_PREVIEW_ACTIONS } from "@/features/product-set/create/config";
import type { ProductImage } from "@/features/product-set/create/types";
import type { AspectRatio, ImageSize } from "@/lib/api/lingya";
import { getImageVariantUrl } from "@/lib/image-variants";
import {
  type ProductSetCreationMode,
  type ProductSetImageType,
  type ProductSetModuleResult,
  type ProductSetResolvedTemplate,
} from "@/lib/product-set";
import { FAILED_RETRY_NOTICE, buildPartialFailureDetail, summarizeGenerationError } from "@/lib/studio-generation-feedback";
import type { ImagePreviewSession } from "@/lib/studio-image-preview";
import { clampTaskExpectedCount, safeTaskQueueUrls, type TaskQueueItem } from "@/lib/task-queue";

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--codex-accent)] focus-visible:ring-offset-2";

export type ProductSetResultSlot = {
  url?: string;
  template?: ProductSetResolvedTemplate;
  module?: ProductSetModuleResult;
};

type ResultsCanvasProps = {
  productImages: ProductImage[];
  fallbackImage: string;
  genCount: number;
  outputCount: number;
  imageType: ProductSetImageType;
  imageSize: ImageSize;
  mode: ProductSetCreationMode;
  platform: string;
  isGenerating: boolean;
  error: string;
  hasResultStage: boolean;
  shouldShowTaskPanel: boolean;
  hasVisibleResults: boolean;
  progress: number;
  moduleResults: ProductSetModuleResult[];
  resultUrls: string[];
  activeQueueTask: TaskQueueItem | null;
  displayedResultPlan: ProductSetResolvedTemplate[];
  resultSlots: ProductSetResultSlot[];
  visibleResultCount: number;
  resultSlotCount: number;
  hasCompletedPartialResults: boolean;
  partialFailureMessage: string;
  regeneratingIndex: number | null;
  aspectRatio: AspectRatio;
  previewIndex: number | null;
  previewSession: ImagePreviewSession;
  onGenerate: () => void;
  onClearError: () => void;
  onPreviewIndexChange: (index: number | null) => void;
  onRegenerate: (index: number) => void;
  onDownload: (url: string, index: number) => void;
};

export function ResultsCanvas({
  productImages,
  fallbackImage,
  genCount,
  outputCount,
  imageType,
  imageSize,
  mode,
  platform,
  isGenerating,
  error,
  hasResultStage,
  shouldShowTaskPanel,
  hasVisibleResults,
  progress,
  moduleResults,
  resultUrls,
  activeQueueTask,
  displayedResultPlan,
  resultSlots,
  visibleResultCount,
  resultSlotCount,
  hasCompletedPartialResults,
  partialFailureMessage,
  regeneratingIndex,
  aspectRatio,
  previewIndex,
  previewSession,
  onGenerate,
  onClearError,
  onPreviewIndexChange,
  onRegenerate,
  onDownload,
}: ResultsCanvasProps) {
  const t = useTranslations("ProductSet");
  return (
    <main className="studio-canvas relative min-h-[70dvh] flex-1 overflow-visible lg:overflow-hidden">
      <div className="relative overflow-y-visible p-4 pb-24 sm:p-6 lg:absolute lg:inset-0 lg:overflow-y-auto lg:p-8">
        {!isGenerating && !error && !hasResultStage && !shouldShowTaskPanel ? (
          <div className="mx-auto flex min-h-[calc(100dvh-160px)] max-w-3xl items-center justify-center">
            <PreviewGuide
              imageSrc={getImageVariantUrl(productImages[0]?.url || fallbackImage, "card")}
              imageAlt="商品套图示例"
              title="开始制作商品套图"
              subtitle="先分析商品信息，再按你选择的数量生成主图/详情页计划。"
              steps={[
                { title: "上传商品图", desc: "最多 3 张，建议包含正面、侧面、背面或细节，方便系统判断结构与卖点。" },
                { title: "分析商品信息", desc: "系统会整理目标平台、风格、统一场景、卖点、痛点、人群、参数和配色。" },
                { title: "生成套图计划", desc: `按 ${genCount || "选择的"} ${imageType === "main" ? "张主图" : "屏详情页"}输出中文方案，再开始生成。` },
              ]}
            />
          </div>
        ) : null}

        {(isGenerating || shouldShowTaskPanel) && !hasVisibleResults && moduleResults.length === 0 ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <LoadingStage
              genCount={activeQueueTask ? clampTaskExpectedCount(activeQueueTask, 1, imageType === "details" ? 8 : 6) : Math.max(outputCount, 1)}
              progress={activeQueueTask?.progress || progress}
              moduleName="商品套图"
              referenceImages={(safeTaskQueueUrls(activeQueueTask?.inputThumbnails).length ? safeTaskQueueUrls(activeQueueTask?.inputThumbnails) : productImages.map((item) => item.url)).map((url, index) => ({
                label: `商品参考 ${index + 1}`,
                url,
              }))}
              metaItems={[imageType === "main" ? "主图辅图" : "详情页", platform, imageSize]}
            />
            {displayedResultPlan.length > 0 ? (
              <ModuleProgressList templates={displayedResultPlan} moduleResults={moduleResults} resultUrls={resultUrls} isGenerating={isGenerating} />
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="studio-result-stage flex min-h-[360px] items-center justify-center px-4" role="alert">
            <div className="max-w-md rounded-[28px] border border-red-100 bg-white p-6 text-center shadow-[0_18px_70px_rgba(15,23,42,0.08)]">
              <div aria-hidden="true" className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <X className="h-7 w-7 text-red-400" />
              </div>
              <h2 className="text-base font-black text-slate-950 text-pretty dark:text-stone-100">商品套图生成失败</h2>
              <p className="mt-2 text-sm leading-6 text-red-500">{summarizeGenerationError(error)}</p>
              <p className="mx-auto mt-3 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold leading-5 text-amber-700">
                {FAILED_RETRY_NOTICE}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" onClick={onGenerate} className={`h-10 touch-manipulation rounded-full bg-slate-950 px-5 text-sm font-bold text-white transition-colors hover:bg-slate-800 ${focusRing}`}>重试</button>
                <button type="button" onClick={onClearError} className={`h-10 touch-manipulation rounded-full border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-stone-300 ${focusRing}`}>清空</button>
              </div>
            </div>
          </div>
        ) : null}

        {hasResultStage && !error ? (
          <section aria-label="商品套图结果" className="studio-result-stage animate-fade-in motion-reduce:animate-none">
            <div className="mb-5 rounded-[28px] border border-white/80 bg-white/82 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-black text-slate-950 text-pretty dark:text-stone-100">{isGenerating ? "商品套图生成中" : "商品套图结果"}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {activeQueueTask?.time ? `${activeQueueTask.time} · ` : ""}
                    {mode === "smart" ? "智能套图" : "自定义套图"} · {imageType === "main" ? "主图辅图" : "详情页"} · {platform} · 已出 {visibleResultCount}/{resultSlotCount}
                  </p>
                </div>
                <span aria-live="polite" className="inline-flex h-9 shrink-0 items-center justify-center rounded-full bg-[rgba(91,124,255,0.1)] px-3 text-xs font-black text-[var(--codex-accent)]">
                  {isGenerating ? `${progress}% 继续生成` : "已完成"}
                </span>
              </div>
              {isGenerating ? (
                <div
                  role="progressbar"
                  aria-label="商品套图生成进度"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-white/5"
                >
                  <div className="h-full rounded-full bg-gradient-to-r from-slate-700 to-slate-950 transition-[width] motion-reduce:transition-none" style={{ width: `${Math.min(Math.max(progress, 0), 99)}%` }} />
                </div>
              ) : null}
              <ModuleProgressList templates={displayedResultPlan} moduleResults={moduleResults} resultUrls={resultUrls} isGenerating={isGenerating} compact />
            </div>
            <div className="grid auto-rows-fr gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {resultSlots.map(({ url, template, module }, index) => {
                const slotFailed = module?.status === "failed" || (!url && hasCompletedPartialResults);
                const slotFailureDetail = module?.error
                  ? buildPartialFailureDetail({ message: module.error, failedCount: 1 })
                  : partialFailureMessage;
                const cardTitle = template?.name || `结果 ${index + 1}`;

                return (
                  <article key={`${template?.source || "result"}-${template?.id || module?.moduleKey || index}`} className="flex h-full flex-col overflow-hidden rounded-[24px] border border-white/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                    {url ? (
                      <button
                        type="button"
                        aria-label={`预览${cardTitle}`}
                        onClick={() => onPreviewIndexChange(index)}
                        className={`group relative aspect-[3/4] w-full touch-manipulation overflow-hidden bg-slate-100 dark:bg-white/5 ${focusRing}`}
                      >
                        <RawPreviewImage src={getImageVariantUrl(url, "card")} alt={template?.name || `商品套图${index + 1}`} className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none" />
                        <span aria-hidden="true" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          <ZoomIn className="h-4 w-4" />
                        </span>
                      </button>
                    ) : slotFailed ? (
                      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center bg-red-50 px-5 text-center">
                        <X aria-hidden="true" className="h-7 w-7 text-red-400" />
                        <p className="mt-3 text-xs font-black text-red-500">该模块生成失败</p>
                        <p className="mt-1 max-w-56 text-[11px] leading-4 text-red-400">{slotFailureDetail}</p>
                        <button type="button" onClick={() => onRegenerate(index)} disabled={regeneratingIndex !== null || isGenerating} className={`mt-4 inline-flex h-9 touch-manipulation items-center gap-1.5 rounded-full bg-white px-3 text-xs font-black text-red-500 shadow-sm transition-colors hover:bg-red-100 disabled:opacity-50 ${focusRing}`}>
                          {regeneratingIndex === index ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
                          {regeneratingIndex === index ? "重生中…" : "重生本张"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center bg-slate-50 text-center dark:bg-white/5" aria-live="polite">
                        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-[var(--codex-accent)] motion-reduce:animate-none" />
                        <p className="mt-3 text-xs font-black text-slate-500 dark:text-stone-300">等待生成</p>
                        <p className="mt-1 max-w-32 text-[11px] leading-4 text-slate-400 dark:text-stone-500">该模块完成后会自动填入预览区</p>
                      </div>
                    )}
                    <div className="flex min-h-[94px] flex-1 p-3">
                      <div className="flex w-full items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black text-slate-900 dark:text-stone-100">{cardTitle}</h3>
                          <p className="mt-1 text-[11px] font-bold text-slate-400">{url ? "已生成" : slotFailed ? "生成失败" : "生成中"} · {template?.imageType === "details" ? "详情页模块" : "主图/辅图"} · {getAspectRatioLabel(template?.aspectRatio || aspectRatio, t)}</p>
                          {module?.qualityScore !== undefined ? (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <QualityBadge score={module.qualityScore} />
                              {module.qualityIssues?.slice(0, 1).map((issue) => (
                                <span key={`${module.moduleKey}-${issue}`} className="line-clamp-1 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-stone-300">
                                  {issue}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        {url ? (
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              aria-label={`重新生成${cardTitle}`}
                              onClick={() => onRegenerate(index)}
                              disabled={regeneratingIndex !== null || isGenerating}
                              className={`flex h-9 w-9 touch-manipulation items-center justify-center rounded-full border border-[rgba(91,124,255,0.22)] text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.12)] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                            >
                              {regeneratingIndex === index ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              aria-label={`下载${cardTitle}`}
                              onClick={() => onDownload(url, index)}
                              className={`flex h-9 w-9 touch-manipulation items-center justify-center rounded-full border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-stone-400 dark:hover:bg-white/5 ${focusRing}`}
                            >
                              <Download aria-hidden="true" className="h-4 w-4" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            <StudioImagePreviewDialog
              open={previewIndex !== null}
              onClose={() => onPreviewIndexChange(null)}
              session={previewSession}
              selectedIndex={previewIndex || 0}
              onSelectedIndexChange={onPreviewIndexChange}
              filenamePrefix="product-set"
              actions={PRODUCT_SET_PREVIEW_ACTIONS.map((a) => ({ ...a, label: t(a.labelKey) }))}
              onRegenerateOne={(_, index) => onRegenerate(index)}
            />
          </section>
        ) : null}
      </div>
    </main>
  );
}
