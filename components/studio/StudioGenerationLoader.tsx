"use client";

import { Clock3, ImageIcon, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { getImageVariantUrl } from "@/lib/image-variants";
import { StudioHomeHeroLoadingBackdrop } from "@/components/studio/StudioHomeHeroLoadingBackdrop";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

export type StudioLoaderReferenceImage = {
  url?: string | null;
  label: string;
};

export type StudioGenerationLoaderProps = {
  count: number;
  progress: number;
  moduleName?: string;
  statusText?: string;
  aspectRatio?: string;
  referenceImages?: StudioLoaderReferenceImage[];
  estimatedTime?: string;
  metaItems?: string[];
};

function getProgressLabel(progress: number, t: (key: string) => string): string {
  if (progress < 15) return t("progressPrepare");
  if (progress < 50) return t("progressRender");
  if (progress < 90) return t("progressFinalize");
  return t("progressAlmostDone");
}

export function StudioGenerationLoader({
  count,
  progress,
  moduleName,
  statusText,
  aspectRatio = "3/4",
  referenceImages = [],
  estimatedTime,
  metaItems = [],
}: StudioGenerationLoaderProps) {
  const t = useTranslations("Shared");
  const resolvedModuleName = moduleName ?? t("imageGeneration");
  const resolvedEstimatedTime = estimatedTime ?? t("estimating");
  const safeCount = Math.max(1, Math.min(count, 4));
  const displayProgress = Math.round(Math.max(0, Math.min(progress, 100)));
  const gridClass = safeCount > 1 ? "grid-cols-2 max-w-[460px]" : "grid-cols-1 max-w-[330px]";
  const label = statusText || getProgressLabel(displayProgress, t);
  const visibleRefs = referenceImages.filter((item) => item.url).slice(0, 4);
  const mergedMeta = [resolvedEstimatedTime, t("resultCountUnit", { count: safeCount }), ...metaItems].filter(Boolean);

  return (
    <div className="studio-loading-stage flex min-h-[280px] items-center justify-center p-5 sm:min-h-[380px] sm:p-8 lg:h-full" aria-busy="true">
      <div className="w-full max-w-5xl">
        <div className="studio-generation-loader-status mx-auto mb-4 flex max-w-[720px] flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" role="status" aria-live="polite" aria-atomic="true">
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-[-0.01em] text-codex-ink">{t("moduleGenerating", { name: resolvedModuleName })}</p>
            <p className="mt-0.5 text-xs text-codex-muted">{label}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {mergedMeta.map((item) => (
              <span key={item} className="studio-generation-loader-meta inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-codex-muted">
                {item === resolvedEstimatedTime && <Clock3 className="h-3 w-3 text-[var(--codex-accent)]" aria-hidden="true" />}
                {item}
              </span>
            ))}
          </div>
        </div>

        {visibleRefs.length > 0 && (
          <div className="mx-auto mb-4 flex max-w-[720px] flex-wrap justify-center gap-2">
            {visibleRefs.map((item) => (
              <span key={`${item.label}-${item.url}`} className="studio-generation-loader-reference flex h-14 min-w-[128px] items-center gap-2 p-1.5">
                <span className="flex h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-white">
                  <RawPreviewImage src={getImageVariantUrl(item.url || "", "thumb")} alt="" className="h-full w-full object-cover" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[11px] font-semibold text-codex-ink">{item.label}</span>
                  <span className="mt-0.5 flex items-center gap-1 text-[10px] text-codex-faint">
                    <ImageIcon className="h-3 w-3" aria-hidden="true" />
                    {t("referenceImage")}
                  </span>
                </span>
              </span>
            ))}
          </div>
        )}

        <div className={`mx-auto grid ${gridClass} gap-3 sm:gap-4`}>
          {Array.from({ length: safeCount }).map((_, index) => (
            <div key={index} className="gen-card relative overflow-hidden rounded-2xl" style={{ aspectRatio }}>
              <StudioHomeHeroLoadingBackdrop />
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-1.5">
                <div className="relative flex h-12 w-12 items-center justify-center">
                  <div className="relative flex h-12 w-12 items-center justify-center rounded-full border border-white/14 bg-black/14 shadow-sm">
                    <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden="true" />
                  </div>
                </div>
                <span className="text-xl font-semibold tabular-nums text-white">{displayProgress}%</span>
                <p className="text-[11px] font-medium text-white/62">{safeCount > 1 ? t("generatingImageN", { index: index + 1 }) : label}</p>
              </div>
            </div>
          ))}
        </div>

        <div className={`mx-auto mt-4 flex items-center gap-3 px-1 ${safeCount > 1 ? "max-w-[460px]" : "max-w-[330px]"}`}>
          <span className="shrink-0 text-[11px] font-medium text-codex-muted">{resolvedModuleName}</span>
          <div
            className="studio-loader-progress h-1.5 flex-1 overflow-hidden rounded-full bg-black/10"
            role="progressbar"
            aria-label={`${resolvedModuleName} ${label}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={displayProgress}
          >
            <div
              className="h-full rounded-full bg-[var(--codex-accent)] transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(displayProgress, 5)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
