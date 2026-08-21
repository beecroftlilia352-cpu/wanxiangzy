"use client";

import { memo, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Eye, Loader2, RotateCcw, Sparkles, WandSparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudioHomeHeroLoadingBackdrop } from "@/components/studio/StudioHomeHeroLoadingBackdrop";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { StudioBatchDownloadButton, StudioSingleDownloadButton } from "@/components/studio/StudioMediaDownloadButton";
import { FavoriteAssetButton } from "@/components/resource-library/FavoriteAssetButton";
import {
  createResourceFavoriteDescriptor,
  type ResourceFavoriteCollectionContext,
  type ResourceFavoriteDescriptor,
} from "@/components/resource-library/resource-favorite-types";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useTranslations } from "next-intl";
import { getImageVariantUrl } from "@/lib/image-variants";
import { buildSourceImageHref } from "@/lib/studio-image-preview";
import { generateDownloadFilename } from "@/lib/utils";
import type { TaskStatusGroup } from "@/lib/task-queue";

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'%3E%3Crect width='160' height='120' fill='%23f1f5f9'/%3E%3Ctext x='80' y='62' text-anchor='middle' dominant-baseline='middle' font-size='14' fill='%2394a3b8'%3E加载失败%3C/text%3E%3C/svg%3E";

type ResultImageGridProps = {
  urls: string[];
  filenamePrefix: string;
  onOpen: (url: string, index: number) => void;
  extension?: string;
  expectedCount?: number;
  downloadUrls?: string[];
  downloadExpectedCount?: number;
  showDownloadAction?: boolean;
  isGenerating?: boolean;
  imageAltPrefix?: string;
  inputThumbnails?: string[];
  inputReferences?: ResultInputReference[];
  createdAt?: string | null;
  statusGroup?: TaskStatusGroup;
  variant?: "cards" | "task";
  renderKey?: string;
  markMissingAsFailed?: boolean;
  missingFailureLabel?: string;
  missingFailureDetail?: string;
  missingFailureActionLabel?: string;
  onMissingFailureAction?: (index: number) => void;
  missingFailureActionDisabled?: boolean;
  failureLabel?: string;
  failureDetail?: string;
  /** 启用后：当服务端已标记 status=completed 但 !url 的槽位（partial-failure 元数据为空时），
"
   * ResultCard 渲染为"已完成但缺图"placeholder，不渲染失败标、不渲染 spinner 也不渲染等待生成，
"
   * 与"partial-failure 缺图（failed + 重试）"区分开。 */
  markMissingAsCompleted?: boolean;
  /** 每张结果卡片上叠加的小标签（如目标语种、分辨率等），长度为 N 时与 urls 一一对应；超长/缺失自动截断。 */
  cellLabels?: string[];
  tileAspectRatio?: string;
  reducePendingMotion?: boolean;
  /**
   * Best-pick index — if provided, the corresponding slot gets a "最佳" badge
   * (i18n key `Shared.bestPick`) and a subtle accent ring. Use to surface
   * the highest-confidence result when results finish streaming.
   */
  bestPickIndex?: number | null;
  /** Enables resource-library favorite actions when a generation identity is available. */
  resourceFavorite?: ResourceFavoriteCollectionContext;
};

export type ResultInputReference = {
  url: string;
  label: string;
};

function getGridClass(count: number) {
  // 单图结果略大于 2 图单元，但避免挤满右侧预览区（旧 600px 显得过大）
  if (count <= 1) return "max-w-[min(420px,100%)] grid-cols-1";
  if (count === 2) return "max-w-[min(760px,100%)] grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "max-w-[min(1048px,100%)] grid-cols-1 sm:grid-cols-3";
  return "max-w-[min(1396px,100%)] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

function getTileStyle(aspectRatio?: string): CSSProperties {
  return { aspectRatio: aspectRatio && /^\d+\s*\/\s*\d+$/.test(aspectRatio.trim()) ? aspectRatio.trim() : "3 / 4" };
}

function getResultGridRunningState(
  statusGroup: TaskStatusGroup | undefined,
  isGenerating: boolean | undefined,
  allExpectedResultsReady: boolean
) {
  if (allExpectedResultsReady || statusGroup === "completed" || statusGroup === "failed") return false;
  if (statusGroup === "running" || statusGroup === "queued") return true;
  return Boolean(isGenerating);
}

export function ResultImageGrid({
  urls,
  filenamePrefix,
  onOpen,
  extension = "png",
  expectedCount,
  downloadUrls,
  downloadExpectedCount,
  showDownloadAction = true,
  isGenerating,
  imageAltPrefix,
  inputThumbnails = [],
  inputReferences = [],
  createdAt,
  statusGroup,
  variant = "cards",
  renderKey = "result",
  markMissingAsFailed = false,
  missingFailureLabel,
  missingFailureDetail,
  missingFailureActionLabel,
  onMissingFailureAction,
  missingFailureActionDisabled = false,
  failureLabel,
  failureDetail,
  markMissingAsCompleted = false,
  cellLabels,
  tileAspectRatio,
  reducePendingMotion = false,
  bestPickIndex = null,
  resourceFavorite,
}: ResultImageGridProps) {
  const t = useTranslations("Shared");
  const resolvedImageAltPrefix = imageAltPrefix ?? t("resultImageAlt");
  const fallbackCreatedAt = useMemo(() => new Date().toISOString(), []);
  const count = Math.max(urls.length, expectedCount || 0, 1);
  const isSingle = count <= 1;
  const completedUrls = urls.filter(Boolean);
  const actionUrls = (downloadUrls || completedUrls).filter(Boolean);
  const slots = Array.from({ length: count }, (_, index) => urls[index] || null);
  const completedSlotCount = slots.filter(Boolean).length;
  const allExpectedResultsReady = completedSlotCount >= count;
  const downloadsReady = actionUrls.length >= Math.max(1, downloadExpectedCount || count)
    && !isGenerating
    && statusGroup !== "running"
    && statusGroup !== "queued"
    && statusGroup !== "failed";
  const incomingReferenceItems = useMemo(
    () => buildReferenceItems(inputReferences, inputThumbnails, t("referenceGroup")),
    [inputReferences, inputThumbnails, t]
  );
  const activeTaskSet = variant === "task" && (Boolean(isGenerating) || urls.length > 0 || Boolean(statusGroup));
  const referenceSnapshotKey = useMemo(
    () => [
      createdAt || "",
      renderKey,
      urls.filter(Boolean).join("|"),
      expectedCount || "",
      statusGroup || "",
    ].join("::"),
    [createdAt, expectedCount, renderKey, statusGroup, urls]
  );

  // Track which slots transitioned from null → URL on this render. The set
  // is committed in an effect (avoids setState-during-render) and the slot
  // is removed after the pulse animation completes (~1.4s) so the
  // className doesn't keep re-applying the keyframe.
  const previousUrlsRef = useRef<string[]>(urls);
  const [newResultIndexes, setNewResultIndexes] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (reducePendingMotion) return;
    const prev = previousUrlsRef.current;
    const additions: number[] = [];
    for (let index = 0; index < urls.length; index += 1) {
      if (urls[index] && !prev[index]) additions.push(index);
    }
    previousUrlsRef.current = urls;
    if (!additions.length) return;
    setNewResultIndexes((current) => {
      const next = new Set(current);
      additions.forEach((idx) => next.add(idx));
      return next;
    });
    const timer = setTimeout(() => {
      setNewResultIndexes((current) => {
        const next = new Set(current);
        additions.forEach((idx) => next.delete(idx));
        return next;
      });
    }, 1400);
    return () => clearTimeout(timer);
  }, [urls, reducePendingMotion]);
  const previousGeneratingRef = useRef(false);
  const [referenceSnapshot, setReferenceSnapshot] = useState<{ key: string; items: ResultInputReference[] } | null>(null);

  useEffect(() => {
    const startedRun = Boolean(isGenerating && !previousGeneratingRef.current);
    previousGeneratingRef.current = Boolean(isGenerating);

    if (!activeTaskSet) {
      setReferenceSnapshot(null);
      return;
    }

    setReferenceSnapshot((current) => {
      if (startedRun || !current || (!isGenerating && current.key !== referenceSnapshotKey)) {
        return { key: referenceSnapshotKey, items: incomingReferenceItems };
      }
      return current;
    });
  }, [activeTaskSet, incomingReferenceItems, isGenerating, referenceSnapshotKey]);

  if (variant === "task") {
    const running = getResultGridRunningState(statusGroup, isGenerating, allExpectedResultsReady);
    const failed = statusGroup === "failed";
    const calmPendingMotion = running && (reducePendingMotion || count >= 6);
    const referenceItems = (referenceSnapshot?.items.length ? referenceSnapshot.items : incomingReferenceItems).slice(0, 4);
    const timestamp = formatTaskTimestamp(createdAt) || formatTaskTimestamp(fallbackCreatedAt);

    return (
      <div className="studio-result-set w-full max-w-[min(1480px,100%)]">
        <p className="studio-result-disclaimer">
          {t("groupIdDisclaimer")}
        </p>
        <div className="studio-result-download-row">
          <p className="studio-result-time">{timestamp}</p>
          {showDownloadAction && downloadsReady && actionUrls.length === 1 && (
            <StudioSingleDownloadButton
              url={actionUrls[0]}
              filename={generateDownloadFilename(filenamePrefix, 0, extension)}
              errorFallback={t("downloadFailed")}
              label={t("download")}
              variant="outline"
              size="sm"
              className="studio-result-primary-download"
            />
          )}
          {showDownloadAction && downloadsReady && actionUrls.length > 1 && (
            <StudioBatchDownloadButton
              urls={actionUrls}
              filename={`pixel-diffusion-${filenamePrefix}`}
              resultLabel={t("results")}
              label={t("downloadAll", { count: actionUrls.length })}
              variant="outline"
              size="sm"
              className="studio-result-primary-download studio-result-batch-download"
            />
          )}
        </div>

        <div className="flex w-full items-start gap-3">
          {referenceItems.length > 0 && (
            <div className="studio-result-reference-list">
              {referenceItems.map(({ url: referenceUrl, label }, index) => (
                <div key={`${referenceUrl}-${label}-${index}`} className="studio-result-reference-thumb">
                  <RawPreviewImage src={getImageVariantUrl(referenceUrl, "thumb")} alt={`${label} ${index + 1}`} width={96} height={96} loading="lazy" decoding="async" />
                  <span className="studio-result-reference-label">{label}</span>
                </div>
              ))}
            </div>
          )}

          <div className={`grid min-w-0 flex-1 gap-3 ${getGridClass(count)}`}>
            {slots.map((url, index) => {
              const completedMissing = markMissingAsCompleted && statusGroup === "completed" && !url && !running;
              const missingFailed = !completedMissing && (markMissingAsFailed || statusGroup === "completed") && !url && !running;
              // Keep each visual slot mounted while switching recent tasks so
              // StableResultImage can preserve the decoded image until the
              // replacement is ready.
              const perCardDownloadUrl = showDownloadAction && downloadsReady ? actionUrls[index] ?? null : null;
              return (
                <ResultCard
                  key={`task-result-slot-${index}`}
                  url={url}
                  index={index}
                  count={count}
                  completedMissing={completedMissing}
                  failed={failed || missingFailed}
                  running={running}
                  calmPendingMotion={calmPendingMotion}
                  imageAltPrefix={resolvedImageAltPrefix}
                  onOpen={onOpen}
                  failureLabel={failed ? failureLabel : missingFailed ? missingFailureLabel : undefined}
                  failureDetail={failed ? failureDetail : missingFailed ? missingFailureDetail : undefined}
                  failureActionLabel={missingFailed ? missingFailureActionLabel : undefined}
                  onFailureAction={missingFailed && onMissingFailureAction ? () => onMissingFailureAction(index) : undefined}
                  failureActionDisabled={missingFailureActionDisabled}
                  cellLabel={cellLabels?.[index]}
                  tileAspectRatio={tileAspectRatio}
                  isNew={newResultIndexes.has(index)}
                  isBestPick={bestPickIndex === index}
                  favoriteDescriptor={createResourceFavoriteDescriptor(resourceFavorite, url, index)}
                  downloadUrl={perCardDownloadUrl}
                  filenamePrefix={filenamePrefix}
                  extension={extension}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const running = getResultGridRunningState(statusGroup, isGenerating, allExpectedResultsReady);

  return (
    <div className="studio-result-card-grid-wrap mx-auto w-full">
      {showDownloadAction && downloadsReady && actionUrls.length > 0 && (
        <div className="studio-result-download-row studio-result-download-row-cards">
          <span />
          {actionUrls.length === 1 ? (
            <StudioSingleDownloadButton
              url={actionUrls[0]}
              filename={generateDownloadFilename(filenamePrefix, 0, extension)}
              errorFallback={t("downloadFailed")}
              label={t("download")}
              variant="outline"
              size="sm"
              className="studio-result-primary-download"
            />
          ) : (
            <StudioBatchDownloadButton
              urls={actionUrls}
              filename={`pixel-diffusion-${filenamePrefix}`}
              resultLabel={t("results")}
              label={t("downloadAll", { count: actionUrls.length })}
              variant="outline"
              size="sm"
              className="studio-result-primary-download studio-result-batch-download"
            />
          )}
        </div>
      )}
      <div className={`studio-result-card-grid mx-auto grid w-full gap-3 sm:gap-4 ${getGridClass(count)}`}>
        {slots.map((url, index) => {
          const completedMissing = markMissingAsCompleted && statusGroup === "completed" && !url && !running;
          const missingFailed = !completedMissing && (markMissingAsFailed || statusGroup === "completed") && !url && !running;
          const perCardDownloadUrl = showDownloadAction && downloadsReady ? actionUrls[index] ?? null : null;
          return (
            <ResultCard
              key={`result-slot-${index}`}
              url={url}
              index={index}
              count={count}
              completedMissing={completedMissing}
              failed={statusGroup === "failed" || missingFailed}
              running={running}
              calmPendingMotion={Boolean(running && (reducePendingMotion || count >= 6))}
              imageAltPrefix={resolvedImageAltPrefix}
              onOpen={onOpen}
              isSingle={isSingle}
              failureLabel={statusGroup === "failed" ? failureLabel : missingFailed ? missingFailureLabel : undefined}
              failureDetail={statusGroup === "failed" ? failureDetail : missingFailed ? missingFailureDetail : undefined}
              failureActionLabel={missingFailed ? missingFailureActionLabel : undefined}
              onFailureAction={missingFailed && onMissingFailureAction ? () => onMissingFailureAction(index) : undefined}
              failureActionDisabled={missingFailureActionDisabled}
              tileAspectRatio={tileAspectRatio}
              isNew={newResultIndexes.has(index)}
              isBestPick={bestPickIndex === index}
              favoriteDescriptor={createResourceFavoriteDescriptor(resourceFavorite, url, index)}
              downloadUrl={perCardDownloadUrl}
              filenamePrefix={filenamePrefix}
              extension={extension}
            />
          );
        })}
      </div>
    </div>
  );
}

function buildReferenceItems(inputReferences: ResultInputReference[], inputThumbnails: string[], referenceLabel: string): ResultInputReference[] {
  const labeled = inputReferences
    .filter((item) => item.url)
    .map((item) => ({
      url: item.url,
      label: item.label || referenceLabel,
    }));
  if (labeled.length) return labeled;
  return inputThumbnails
    .filter(Boolean)
    .map((url, index) => ({ url, label: `${referenceLabel}${index + 1}` }));
}

type ResultCardProps = {
  url: string | null;
  index: number;
  count: number;
  failed: boolean;
  running: boolean;
  completedMissing?: boolean;
  calmPendingMotion?: boolean;
  imageAltPrefix: string;
  onOpen: (url: string, index: number) => void;
  isSingle?: boolean;
  failureLabel?: string;
  failureDetail?: string;
  failureActionLabel?: string;
  onFailureAction?: () => void;
  failureActionDisabled?: boolean;
  cellLabel?: string;
  tileAspectRatio?: string;
  /** True when the slot transitioned from null → URL on this render. Drives
   *  the "new result" pulse animation. */
  isNew?: boolean;
  /** True when this slot is the module's best-pick. Drives the 最佳 badge
   *  and an accent ring. */
  isBestPick?: boolean;
  favoriteDescriptor?: ResourceFavoriteDescriptor | null;
  /** When provided, the card renders a top-right single-image download button.
   *  Pass `null` (or omit) to hide the per-card download — the parent gates
   *  this on `showDownloadAction` + `downloadsReady` + an available URL. */
  downloadUrl?: string | null;
  /** Filename stem for per-card downloads. Falls back to "result" when the
   *  parent didn't supply a contextual prefix (e.g. legacy callers). */
  filenamePrefix?: string;
  /** Optional file extension override (e.g. "png" vs "webp"). */
  extension?: string;
};

const ResultCard = memo(function ResultCard({
  url,
  index,
  count,
  failed,
  running,
  completedMissing = false,
  calmPendingMotion,
  imageAltPrefix,
  onOpen,
  isSingle,
  failureLabel,
  failureDetail,
  failureActionLabel,
  onFailureAction,
  failureActionDisabled,
  cellLabel,
  tileAspectRatio,
  isNew = false,
  isBestPick = false,
  favoriteDescriptor,
  downloadUrl,
  filenamePrefix,
  extension,
}: ResultCardProps) {
  const t = useTranslations("Shared");
  const router = useRouter();
  const openPreview = () => {
    if (url) onOpen(url, index);
  };
  const openImageRepair = () => {
    if (!url) return;
    router.push(buildSourceImageHref("/general-image/image-to-image", url));
  };
  const openAiVideo = () => {
    if (!url) return;
    router.push(buildSourceImageHref("/video", url));
  };
  const cardStateClass = url
    ? "studio-result-card-ready"
    : completedMissing
      ? "studio-result-card-static"
      : "studio-result-card-pending-shell";
  const hasPerCardDownload = Boolean(url && downloadUrl);

  return (
    <TooltipProvider>
      <div
        className={`studio-result-card ${cardStateClass} group relative min-w-0 overflow-hidden bg-white focus-within:outline-none focus-within:ring-2 focus-within:ring-blue-500 focus-within:ring-offset-2 ${isSingle ? "mx-auto max-w-full" : ""} ${isNew ? "studio-result-card-new" : ""} ${isBestPick ? "studio-result-card-best" : ""}`}
      >
        {isBestPick && (
          <span
            aria-label={t("bestPick")}
            title={t("bestPick")}
            className={`studio-result-best-pick-badge pointer-events-none absolute top-1.5 z-[3] inline-flex items-center gap-1 rounded-full bg-[var(--codex-accent)] px-2 py-0.5 text-[10px] font-black tracking-wide text-white shadow-sm ${hasPerCardDownload ? "right-12" : "right-1.5"}`}
          >
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            {t("bestPick")}
          </span>
        )}
        {hasPerCardDownload && (
          <StudioSingleDownloadButton
            url={downloadUrl as string}
            filename={generateDownloadFilename(filenamePrefix ?? "result", index, extension)}
            errorFallback={t("downloadFailed")}
            label={t("download")}
            variant="ghost"
            size="sm"
            stopPropagation
            showLabel={false}
            className="studio-result-card-download"
          />
        )}
        {url ? (
          <button
            type="button"
            aria-label={t("previewResult", { label: imageAltPrefix, index: index + 1 })}
            title={t("previewResult", { label: imageAltPrefix, index: index + 1 })}
            className="absolute inset-0 z-[1] cursor-zoom-in"
            onClick={openPreview}
          >
            <span className="sr-only">{t("previewResult", { label: imageAltPrefix, index: index + 1 })}</span>
          </button>
        ) : null}
        {cellLabel ? (
          <span
            className="pointer-events-none absolute left-1.5 top-1.5 z-[2] inline-flex max-w-[calc(100%-12px)] items-center gap-1 rounded-full bg-codex-ink/82 px-2 py-0.5 text-[10px] font-black tracking-wide text-white shadow-sm backdrop-blur"
            title={cellLabel}
          >
            <span className="truncate">{cellLabel}</span>
          </span>
        ) : null}
        <div className="flex items-center justify-center" style={getTileStyle(tileAspectRatio)}>
          {url ? (
            <StableResultImage
              // The result grid is rendered in a ~420px tile at most. Keep
              // detail (2560px) for the zoom/focus surface, not the grid.
              src={getImageVariantUrl(url, "card")}
              alt={`${imageAltPrefix} ${index + 1}`}
            />
          ) : completedMissing ? (
            <div className="studio-result-pending-card flex h-full w-full flex-col items-center justify-center gap-1 bg-[var(--codex-surface-soft)]/70 text-codex-muted dark:bg-[var(--codex-surface-strong)]/40 dark:text-codex-faint">
              <p className="text-xs font-semibold">{t("completedMissing")}</p>
              <p className="px-4 text-center text-[11px] leading-4 text-codex-faint dark:text-codex-muted">{t("noImageResult")}</p>
            </div>
          ) : (
            <PendingResultSlot
              failed={failed}
              running={running}
              calmMotion={calmPendingMotion}
              index={index}
              failureLabel={failureLabel}
              failureDetail={failureDetail}
              failureActionLabel={failureActionLabel}
              onFailureAction={onFailureAction}
              failureActionDisabled={failureActionDisabled}
            />
          )}
        </div>

        {url && (
          <div className="studio-result-focus-layer" aria-hidden={false}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="studio-result-focus-view"
                onClick={(event) => {
                  event.stopPropagation();
                  openPreview();
                }}
                onKeyDown={(event) => event.stopPropagation()}
              >
                <Eye className="h-4 w-4" aria-hidden="true" />
                {t("view")}
              </Button>
              <div className="studio-result-focus-actions">
                <FavoriteAssetButton
                  descriptor={favoriteDescriptor}
                  className="studio-result-focus-action h-8 w-8 p-0"
                />
                <ResultFocusAction label={t("actionRepair")} onClick={openImageRepair} icon={<WandSparkles className="h-3.5 w-3.5" />} />
                <ResultFocusAction label={t("actionAiVideo")} onClick={openAiVideo} icon={<Clapperboard className="h-3.5 w-3.5" />} />
              </div>
            </div>
        )}
      </div>
    </TooltipProvider>
  );
}, areResultCardPropsEqual);

function areResultCardPropsEqual(prev: ResultCardProps, next: ResultCardProps) {
  return (
    prev.url === next.url &&
    prev.index === next.index &&
    prev.count === next.count &&
    prev.failed === next.failed &&
    prev.running === next.running &&
    prev.calmPendingMotion === next.calmPendingMotion &&
    prev.imageAltPrefix === next.imageAltPrefix &&
    prev.onOpen === next.onOpen &&
    prev.isSingle === next.isSingle &&
    prev.failureLabel === next.failureLabel &&
    prev.failureDetail === next.failureDetail &&
    prev.failureActionLabel === next.failureActionLabel &&
    prev.onFailureAction === next.onFailureAction &&
    prev.failureActionDisabled === next.failureActionDisabled &&
    prev.cellLabel === next.cellLabel &&
    prev.completedMissing === next.completedMissing &&
    prev.isNew === next.isNew &&
    prev.isBestPick === next.isBestPick &&
    prev.favoriteDescriptor?.generationId === next.favoriteDescriptor?.generationId &&
    prev.favoriteDescriptor?.resultIndex === next.favoriteDescriptor?.resultIndex &&
    prev.favoriteDescriptor?.url === next.favoriteDescriptor?.url &&
    prev.downloadUrl === next.downloadUrl &&
    prev.filenamePrefix === next.filenamePrefix &&
    prev.extension === next.extension
  );
}

function ResultFocusAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="studio-result-focus-action"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onKeyDown={(event) => event.stopPropagation()}
      aria-label={label}
    >
      {icon}
      <span>{label}</span>
    </Button>
  );
}

function StableResultImage({ src, alt }: { src: string; alt: string }) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [failedSrc, setFailedSrc] = useState("");

  useEffect(() => {
    if (src === displaySrc || src === failedSrc) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) {
        setDisplaySrc(src);
        setFailedSrc("");
      }
    };
    image.onerror = () => {
      if (!cancelled) {
        setDisplaySrc(FALLBACK_IMAGE);
        setFailedSrc(src);
      }
    };
    image.src = src;
    return () => {
      cancelled = true;
    };
  }, [displaySrc, failedSrc, src]);

  return (
    <RawPreviewImage
      src={displaySrc}
      alt={alt}
      width={1200}
      height={1600}
      loading="lazy"
      decoding="async"
      className="h-full w-full object-cover"
      onError={() => {
        setDisplaySrc(FALLBACK_IMAGE);
        setFailedSrc(src);
      }}
    />
  );
}

function PendingResultSlot({
  failed = false,
  running = false,
  calmMotion = false,
  index,
  failureLabel,
  failureDetail,
  failureActionLabel,
  onFailureAction,
  failureActionDisabled,
}: {
  failed?: boolean;
  running?: boolean;
  calmMotion?: boolean;
  index: number;
  failureLabel?: string;
  failureDetail?: string;
  failureActionLabel?: string;
  onFailureAction?: () => void;
  failureActionDisabled?: boolean;
}) {
  const t = useTranslations("Shared");
  return (
    <div className={`gen-card studio-result-pending-card flex h-full w-full flex-col items-center justify-center gap-2 ${failed ? "studio-result-pending-card-failed" : ""} ${calmMotion ? "studio-result-pending-card-calm" : ""}`}>
      {!failed && !calmMotion && <StudioHomeHeroLoadingBackdrop />}
      <div className="relative z-[1] flex h-14 w-14 items-center justify-center">
        <div className="gen-ring absolute inset-0 rounded-full bg-[#aeb8ff]/45" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/16 bg-white/10 shadow-lg backdrop-blur-md">
          {failed ? <XCircle className="h-6 w-6 text-red-200" aria-hidden="true" /> : <Loader2 className="h-6 w-6 animate-spin text-white motion-reduce:animate-none" aria-hidden="true" />}
        </div>
      </div>
      <p className="relative z-[1] text-xs font-semibold text-white/90">
        {failed ? failureLabel || t("generateFailedRetry") : running ? t("generatingPleaseWait") : t("waitingToGenerate")}
      </p>
      {failed && failureDetail && (
        <p className="studio-result-failure-detail relative z-[1] max-h-24 max-w-[82%] overflow-auto rounded-lg px-2.5 py-2 text-left text-[11px] font-medium leading-4">
          {failureDetail}
        </p>
      )}
      {failed && onFailureAction && (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onFailureAction();
          }}
          disabled={failureActionDisabled}
          className="studio-result-failure-action relative z-[1]"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{failureActionLabel || t("retryThis")}</span>
        </button>
      )}
      {!failed && running && (
        <p className="relative z-[1] text-[11px] font-medium text-white/80">{t("generatingImageN", { index: index + 1 })}</p>
      )}
    </div>
  );
}

function formatTaskTimestamp(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (num: number) => String(num).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
