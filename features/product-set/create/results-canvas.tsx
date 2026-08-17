import { Loader2, RefreshCw, X, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { LoadingStage } from "@/components/studio/LoadingStage";
import { PreviewGuide } from "@/components/PreviewGuide";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioImagePreviewDialog } from "@/components/studio/StudioImagePreviewDialog";
import { FavoriteAssetButton } from "@/components/resource-library/FavoriteAssetButton";
import { createResourceFavoriteDescriptor } from "@/components/resource-library/resource-favorite-types";
import {
  StudioBatchDownloadButton,
  StudioSingleDownloadButton,
} from "@/components/studio/StudioMediaDownloadButton";
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
import { generateDownloadFilename } from "@/lib/utils";

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
}: ResultsCanvasProps) {
  const t = useTranslations("ProductSet");
  const sharedT = useTranslations("Shared");
  const completedUrls = resultSlots.flatMap((slot) => slot.url ? [slot.url] : []);
  const favoriteContext = {
    generationId: previewSession.taskId || activeQueueTask?.id,
    moduleKey: "productSet",
    mediaType: "image" as const,
  };
  return (
    <main className="studio-canvas relative min-h-[70dvh] flex-1 overflow-visible lg:overflow-hidden">
      <div className="relative overflow-y-visible p-4 pb-24 sm:p-6 lg:absolute lg:inset-0 lg:overflow-y-auto lg:p-8">
        {!isGenerating && !error && !hasResultStage && !shouldShowTaskPanel ? (
          <div className="mx-auto flex min-h-[calc(100dvh-160px)] max-w-3xl items-center justify-center">
            <PreviewGuide
              imageSrc={getImageVariantUrl(productImages[0]?.url || fallbackImage, "card")}
              imageAlt={t("create.results.exampleAlt")}
              title={t("create.results.guideTitle")}
              subtitle={t("create.results.guideSubtitle")}
              steps={[
                { title: t("create.results.guideStep1Title"), desc: t("create.results.guideStep1Desc") },
                { title: t("create.results.guideStep2Title"), desc: t("create.results.guideStep2Desc") },
                { title: t("create.results.guideStep3Title"), desc: t("create.results.guideStep3Desc", { count: genCount || t("create.results.guideStep3CountFallback"), unit: imageType === "main" ? t("units.mainImage") : t("units.detailPage") }) },
              ]}
            />
          </div>
        ) : null}

        {(isGenerating || shouldShowTaskPanel) && !hasVisibleResults && moduleResults.length === 0 ? (
          <div className="mx-auto max-w-3xl space-y-4">
            <LoadingStage
              genCount={activeQueueTask ? clampTaskExpectedCount(activeQueueTask, 1, imageType === "details" ? 8 : 6) : Math.max(outputCount, 1)}
              progress={activeQueueTask?.progress || progress}
              moduleName={t("create.results.loadingModule")}
              referenceImages={(safeTaskQueueUrls(activeQueueTask?.inputThumbnails).length ? safeTaskQueueUrls(activeQueueTask?.inputThumbnails) : productImages.map((item) => item.url)).map((url, index) => ({
                label: t("create.results.loadingRef", { index: index + 1 }),
                url,
              }))}
              metaItems={[imageType === "main" ? t("meta.mainAux") : t("meta.detailsPage"), platform, imageSize]}
            />
            {displayedResultPlan.length > 0 ? (
              <ModuleProgressList templates={displayedResultPlan} moduleResults={moduleResults} resultUrls={resultUrls} isGenerating={isGenerating} />
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="studio-result-stage flex min-h-[360px] items-center justify-center px-4" role="alert">
            <div className="max-w-md rounded-3xl border border-red-100 bg-white p-6 text-center shadow-[0_18px_70px_rgba(15,23,42,0.08)]">
              <div aria-hidden="true" className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-red-50">
                <X className="h-7 w-7 text-red-400" />
              </div>
              <h2 className="text-base font-black text-slate-950 text-pretty dark:text-stone-100">{t("create.results.failedTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-red-500">{summarizeGenerationError(error)}</p>
              <p className="mx-auto mt-3 max-w-sm rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold leading-5 text-amber-700">
                {FAILED_RETRY_NOTICE}
              </p>
              <div className="mt-5 flex justify-center gap-2">
                <button type="button" onClick={onGenerate} className={`h-10 touch-manipulation rounded-full bg-slate-950 px-5 text-sm font-bold text-white transition-colors hover:bg-slate-800 ${focusRing}`}>{t("create.results.retry")}</button>
                <button type="button" onClick={onClearError} className={`h-10 touch-manipulation rounded-full border border-slate-200 bg-white px-5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-stone-300 ${focusRing}`}>{t("common.clear")}</button>
              </div>
            </div>
          </div>
        ) : null}

        {hasResultStage && !error ? (
          <section aria-label={t("create.results.resultAria")} className="studio-result-stage animate-fade-in motion-reduce:animate-none">
            <div className="mb-5 rounded-3xl border border-white/80 bg-white/82 p-4 shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <h2 className="text-xl font-black text-slate-950 text-pretty dark:text-stone-100">{isGenerating ? t("create.results.generatingTitle") : t("create.results.resultTitle")}</h2>
                  <p className="mt-1 text-xs text-slate-400">
                    {activeQueueTask?.time ? `${activeQueueTask.time} · ` : ""}
                    {mode === "smart" ? t("meta.smartSet") : t("meta.customSet")} · {imageType === "main" ? t("meta.mainAux") : t("meta.detailsPage")} · {platform} · {t("create.results.generatedCount", { current: visibleResultCount, total: resultSlotCount })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {completedUrls.length > 1 ? (
                    <StudioBatchDownloadButton
                      urls={completedUrls}
                      filename="pixel-diffusion-product-set"
                      label={`${t("create.results.completed")} ZIP`}
                      resultLabel={t("create.results.resultTitle")}
                      size="sm"
                      variant="outline"
                      className="h-9 rounded-full bg-white px-3 text-xs font-black shadow-sm"
                    />
                  ) : null}
                  <span aria-live="polite" className="inline-flex h-9 items-center justify-center rounded-full bg-[rgba(91,124,255,0.1)] px-3 text-xs font-black text-[var(--codex-accent)]">
                    {isGenerating ? t("create.results.progressCount", { progress }) : t("create.results.completed")}
                  </span>
                </div>
              </div>
              {isGenerating ? (
                <div
                  role="progressbar"
                  aria-label={t("create.results.progressAria")}
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
                const cardTitle = template?.name || t("create.results.cardFallback", { index: index + 1 });

                return (
                  <article key={`${template?.source || "result"}-${template?.id || module?.moduleKey || index}`} className="flex h-full flex-col overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                    {url ? (
                      <button
                        type="button"
                        aria-label={t("create.results.previewAria", { name: cardTitle })}
                        onClick={() => onPreviewIndexChange(index)}
                        className={`group relative aspect-[3/4] w-full touch-manipulation overflow-hidden bg-slate-100 dark:bg-white/5 ${focusRing}`}
                      >
                        <RawPreviewImage src={getImageVariantUrl(url, "card")} alt={template?.name || t("create.results.resultAlt", { index: index + 1 })} className="h-full w-full object-contain transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none" />
                        <span aria-hidden="true" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                          <ZoomIn className="h-4 w-4" />
                        </span>
                      </button>
                    ) : slotFailed ? (
                      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center bg-red-50 px-5 text-center">
                        <X aria-hidden="true" className="h-7 w-7 text-red-400" />
                        <p className="mt-3 text-xs font-black text-red-500">{t("create.results.moduleFailed")}</p>
                        <p className="mt-1 max-w-56 text-[11px] leading-4 text-red-400">{slotFailureDetail}</p>
                        <button type="button" onClick={() => onRegenerate(index)} disabled={regeneratingIndex !== null || isGenerating} className={`mt-4 inline-flex h-9 touch-manipulation items-center gap-1.5 rounded-full bg-white px-3 text-xs font-black text-red-500 shadow-sm transition-colors hover:bg-red-100 disabled:opacity-50 ${focusRing}`}>
                          {regeneratingIndex === index ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />}
                          {regeneratingIndex === index ? t("create.results.regenerating") : t("create.results.regenerate")}
                        </button>
                      </div>
                    ) : (
                      <div className="flex aspect-[3/4] w-full flex-col items-center justify-center bg-slate-50 text-center dark:bg-white/5" aria-live="polite">
                        <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-[var(--codex-accent)] motion-reduce:animate-none" />
                        <p className="mt-3 text-xs font-black text-slate-500 dark:text-stone-300">{t("create.results.waiting")}</p>
                        <p className="mt-1 max-w-32 text-[11px] leading-4 text-slate-400 dark:text-stone-500">{t("create.results.waitingDesc")}</p>
                      </div>
                    )}
                    <div className="flex min-h-[94px] flex-1 p-3">
                      <div className="flex w-full items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="truncate text-sm font-black text-slate-900 dark:text-stone-100">{cardTitle}</h3>
                          <p className="mt-1 text-[11px] font-bold text-slate-400">{url ? t("create.results.statusGenerated") : slotFailed ? t("create.results.statusFailed") : t("create.results.statusGenerating")} · {template?.imageType === "details" ? t("create.moduleEdit.modelTypeDetails") : t("create.moduleEdit.modelTypeMain")} · {getAspectRatioLabel(template?.aspectRatio || aspectRatio, t)}</p>
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
                            <FavoriteAssetButton
                              descriptor={createResourceFavoriteDescriptor(favoriteContext, url, index, cardTitle)}
                              className={`h-9 w-9 border-slate-200 shadow-none ${focusRing}`}
                            />
                            <button
                              type="button"
                              aria-label={t("create.results.regenerateAria", { name: cardTitle })}
                              onClick={() => onRegenerate(index)}
                              disabled={regeneratingIndex !== null || isGenerating}
                              className={`flex h-9 w-9 touch-manipulation items-center justify-center rounded-full border border-[rgba(91,124,255,0.22)] text-[var(--codex-accent)] transition-colors hover:bg-[rgba(91,124,255,0.12)] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                            >
                              {regeneratingIndex === index ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden="true" className="h-4 w-4" />}
                            </button>
                            <StudioSingleDownloadButton
                              url={url}
                              filename={generateDownloadFilename("product-set", index, "png")}
                              label={t("create.results.downloadAria", { name: cardTitle })}
                              errorFallback={sharedT("downloadFailed")}
                              showLabel={false}
                              variant="ghost"
                              className={`h-9 w-9 rounded-full border border-slate-200 p-0 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-stone-400 dark:hover:bg-white/5 ${focusRing}`}
                            />
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
