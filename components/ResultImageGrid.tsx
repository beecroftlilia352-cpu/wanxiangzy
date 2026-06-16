"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Clapperboard, Download, Eye, Loader2, RotateCcw, WandSparkles, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StudioHomeHeroLoadingBackdrop } from "@/components/studio/StudioHomeHeroLoadingBackdrop";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { getImageVariantUrl } from "@/lib/image-variants";
import { buildSourceImageHref } from "@/lib/studio-image-preview";
import { downloadImage, generateDownloadFilename } from "@/lib/utils";
import type { TaskStatusGroup } from "@/lib/task-queue";

const FALLBACK_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'%3E%3Crect width='160' height='120' fill='%23f1f5f9'/%3E%3Ctext x='80' y='62' text-anchor='middle' dominant-baseline='middle' font-size='14' fill='%2394a3b8'%3E加载失败%3C/text%3E%3C/svg%3E";

type ResultImageGridProps = {
  urls: string[];
  filenamePrefix: string;
  onOpen: (url: string, index: number) => void;
  extension?: string;
  expectedCount?: number;
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
};

export type ResultInputReference = {
  url: string;
  label: string;
};

function getGridClass(count: number) {
  if (count <= 1) return "max-w-[min(340px,100%)] grid-cols-1";
  if (count === 2) return "max-w-[min(700px,100%)] grid-cols-1 sm:grid-cols-2";
  if (count === 3) return "max-w-[min(1048px,100%)] grid-cols-1 sm:grid-cols-3";
  return "max-w-[min(1396px,100%)] grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
}

function getTileStyle(): CSSProperties {
  return { aspectRatio: "3 / 4" };
}

export function ResultImageGrid({
  urls,
  filenamePrefix,
  onOpen,
  extension = "png",
  expectedCount,
  isGenerating,
  imageAltPrefix = "生成结果",
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
}: ResultImageGridProps) {
  const fallbackCreatedAt = useMemo(() => new Date().toISOString(), []);
  const count = Math.max(urls.length, expectedCount || 0, 1);
  const isSingle = count <= 1;
  const slots = Array.from({ length: count }, (_, index) => urls[index] || null);

  if (variant === "task") {
    const running = isGenerating || statusGroup === "running" || statusGroup === "queued";
    const failed = statusGroup === "failed";
    const referenceItems = buildReferenceItems(inputReferences, inputThumbnails).slice(0, 4);
    const timestamp = formatTaskTimestamp(createdAt) || formatTaskTimestamp(fallbackCreatedAt);

    return (
      <div className="studio-result-set w-full max-w-[min(1480px,100%)]">
        <p className="studio-result-disclaimer">
          因产品处于持续学习调优阶段，可能有不恰当的信息，请您谨慎甄别。
        </p>
        <p className="studio-result-time">{timestamp}</p>

        <div className="flex w-full items-start gap-3">
          {referenceItems.length > 0 && (
            <div className="studio-result-reference-list">
              {referenceItems.map(({ url: referenceUrl, label }, index) => (
                <div key={`${referenceUrl}-${label}-${index}`} className="studio-result-reference-thumb">
                  <img src={getImageVariantUrl(referenceUrl, "thumb")} alt={`${label} ${index + 1}`} />
                  <span className="studio-result-reference-label">{label}</span>
                </div>
              ))}
            </div>
          )}

          <div className={`grid min-w-0 flex-1 gap-3 ${getGridClass(count)}`}>
            {slots.map((url, index) => {
              const missingFailed = markMissingAsFailed && !url && !running;
              return (
                <ResultCard
                  key={`${renderKey}-${index}`}
                  url={url}
                  index={index}
                  count={count}
                  failed={failed || missingFailed}
                  running={running}
                  filenamePrefix={filenamePrefix}
                  extension={extension}
                  imageAltPrefix={imageAltPrefix}
                  onOpen={onOpen}
                  failureLabel={failed ? failureLabel : missingFailed ? missingFailureLabel : undefined}
                  failureDetail={failed ? failureDetail : missingFailed ? missingFailureDetail : undefined}
                  failureActionLabel={missingFailed ? missingFailureActionLabel : undefined}
                  onFailureAction={missingFailed && onMissingFailureAction ? () => onMissingFailureAction(index) : undefined}
                  failureActionDisabled={missingFailureActionDisabled}
                />
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`studio-result-card-grid mx-auto grid w-full gap-3 sm:gap-4 ${getGridClass(count)}`}>
      {slots.map((url, index) => (
        <ResultCard
          key={`${renderKey}-${index}`}
          url={url}
          index={index}
          count={count}
          failed={markMissingAsFailed && !url && !isGenerating}
          running={Boolean(isGenerating)}
          filenamePrefix={filenamePrefix}
          extension={extension}
          imageAltPrefix={imageAltPrefix}
          onOpen={onOpen}
          isSingle={isSingle}
          failureLabel={markMissingAsFailed && !url && !isGenerating ? missingFailureLabel : undefined}
          failureDetail={markMissingAsFailed && !url && !isGenerating ? missingFailureDetail : undefined}
          failureActionLabel={markMissingAsFailed && !url && !isGenerating ? missingFailureActionLabel : undefined}
          onFailureAction={markMissingAsFailed && !url && !isGenerating && onMissingFailureAction ? () => onMissingFailureAction(index) : undefined}
          failureActionDisabled={missingFailureActionDisabled}
        />
      ))}
    </div>
  );
}

function buildReferenceItems(inputReferences: ResultInputReference[], inputThumbnails: string[]): ResultInputReference[] {
  const labeled = inputReferences
    .filter((item) => item.url)
    .map((item) => ({
      url: item.url,
      label: item.label || "参考图",
    }));
  if (labeled.length) return labeled;
  return inputThumbnails
    .filter(Boolean)
    .map((url, index) => ({ url, label: `参考图${index + 1}` }));
}

function ResultCard({
  url,
  index,
  count,
  failed,
  running,
  filenamePrefix,
  extension,
  imageAltPrefix,
  onOpen,
  isSingle,
  failureLabel,
  failureDetail,
  failureActionLabel,
  onFailureAction,
  failureActionDisabled,
}: {
  url: string | null;
  index: number;
  count: number;
  failed: boolean;
  running: boolean;
  filenamePrefix: string;
  extension: string;
  imageAltPrefix: string;
  onOpen: (url: string, index: number) => void;
  isSingle?: boolean;
  failureLabel?: string;
  failureDetail?: string;
  failureActionLabel?: string;
  onFailureAction?: () => void;
  failureActionDisabled?: boolean;
}) {
  const router = useRouter();
  const openPreview = () => {
    if (url) onOpen(url, index);
  };
  const downloadResult = () => {
    if (!url) return;
    downloadImage(url, generateDownloadFilename(filenamePrefix, index, extension));
  };
  const openImageRepair = () => {
    if (!url) return;
    router.push(buildSourceImageHref("/general-image/image-to-image", url));
  };
  const openAiVideo = () => {
    if (!url) return;
    router.push(buildSourceImageHref("/video", url));
  };

  return (
    <TooltipProvider>
      <div
        role={url ? "button" : undefined}
        tabIndex={url ? 0 : undefined}
        aria-label={url ? `预览${imageAltPrefix} ${index + 1}` : undefined}
        title={url ? `预览${imageAltPrefix} ${index + 1}` : undefined}
        className={`studio-result-card group relative min-w-0 overflow-hidden bg-white transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
          url ? "cursor-zoom-in" : ""
        } ${isSingle ? "mx-auto max-w-full" : ""}`}
        onClick={openPreview}
        onKeyDown={(event) => {
          if (!url || (event.key !== "Enter" && event.key !== " ")) return;
          event.preventDefault();
          openPreview();
        }}
      >
        <div className="flex items-center justify-center" style={getTileStyle()}>
          {url ? (
            <StableResultImage
              src={getImageVariantUrl(url, count <= 1 ? "preview" : "card")}
              alt={`${imageAltPrefix} ${index + 1}`}
            />
          ) : (
            <PendingResultSlot
              failed={failed}
              running={running}
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
              <Eye className="h-4 w-4" />
              查看
            </Button>
            <div className="studio-result-focus-actions">
              <ResultFocusAction label="AI修图" onClick={openImageRepair} icon={<WandSparkles className="h-3.5 w-3.5" />} />
              <ResultFocusAction label="AI视频" onClick={openAiVideo} icon={<Clapperboard className="h-3.5 w-3.5" />} />
              <ResultFocusAction label="下载" onClick={downloadResult} icon={<Download className="h-3.5 w-3.5" />} />
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

function ResultFocusAction({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
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
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
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
    <img
      src={displaySrc}
      alt={alt}
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
  index,
  failureLabel,
  failureDetail,
  failureActionLabel,
  onFailureAction,
  failureActionDisabled,
}: {
  failed?: boolean;
  running?: boolean;
  index: number;
  failureLabel?: string;
  failureDetail?: string;
  failureActionLabel?: string;
  onFailureAction?: () => void;
  failureActionDisabled?: boolean;
}) {
  return (
    <div className={`gen-card studio-result-pending-card flex h-full w-full flex-col items-center justify-center gap-2 ${failed ? "studio-result-pending-card-failed" : ""}`}>
      {!failed && <StudioHomeHeroLoadingBackdrop />}
      <div className="relative z-[1] flex h-14 w-14 items-center justify-center">
        <div className="gen-ring absolute inset-0 rounded-full bg-[#aeb8ff]/45" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-full border border-white/16 bg-white/10 shadow-lg backdrop-blur-md">
          {failed ? <XCircle className="h-6 w-6 text-red-200" /> : <Loader2 className="h-6 w-6 animate-spin text-white" />}
        </div>
      </div>
      <p className="relative z-[1] text-xs font-semibold text-white/72">
        {failed ? failureLabel || "生成失败，可套用参数重试" : running ? "生成中，请稍候" : "等待生成"}
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
          <RotateCcw className="h-3.5 w-3.5" />
          <span>{failureActionLabel || "重试本张"}</span>
        </button>
      )}
      {!failed && running && (
        <p className="relative z-[1] text-[11px] font-medium text-white/42">第 {index + 1} 张生成中</p>
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
