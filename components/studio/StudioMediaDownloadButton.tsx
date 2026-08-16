"use client";

import type { ComponentProps } from "react";
import { Archive, Check, Download, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getBatchDownloadStatusLabel,
  useMediaDownload,
  type MediaDownloadActionState,
} from "@/hooks/use-media-download";
import { cn } from "@/lib/utils";

type SharedButtonProps = Omit<ComponentProps<typeof Button>, "onClick" | "children"> & {
  label: string;
  stopPropagation?: boolean;
  showLabel?: boolean;
};

type SingleDownloadButtonProps = SharedButtonProps & {
  url: string;
  filename: string;
  errorFallback: string;
};

type BatchDownloadButtonProps = SharedButtonProps & {
  urls: string[];
  filename: string;
  resultLabel: string;
};

export function StudioSingleDownloadButton({
  url,
  filename,
  errorFallback,
  label,
  stopPropagation = true,
  showLabel = true,
  className,
  disabled,
  ...buttonProps
}: SingleDownloadButtonProps) {
  const { singleState, downloadOne } = useMediaDownload();
  const running = singleState.status === "running";
  const visibleLabel = running ? `${label}…` : label;
  return (
    <Button
      {...buttonProps}
      type="button"
      disabled={disabled || running || !url}
      aria-busy={running}
      aria-label={label}
      title={label}
      className={cn("studio-media-download-button", className)}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
        void downloadOne({ url, filename, errorFallback });
      }}
    >
      <DownloadStatusIcon state={singleState} batch={false} />
      {showLabel && <span aria-live="polite">{visibleLabel}</span>}
      <DownloadProgressTrack state={singleState} />
    </Button>
  );
}

export function StudioBatchDownloadButton({
  urls,
  filename,
  resultLabel,
  label,
  stopPropagation = true,
  showLabel = true,
  className,
  disabled,
  ...buttonProps
}: BatchDownloadButtonProps) {
  const { batchState, downloadBatch } = useMediaDownload();
  const running = batchState.status === "running";
  const visibleLabel = getBatchDownloadStatusLabel(label, batchState);
  return (
    <Button
      {...buttonProps}
      type="button"
      disabled={disabled || running || urls.length < 2}
      aria-busy={running}
      aria-label={label}
      title={label}
      className={cn("studio-media-download-button studio-media-download-button-batch", className)}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
        void downloadBatch({ urls, filename, label: resultLabel });
      }}
    >
      <DownloadStatusIcon state={batchState} batch />
      {showLabel && <span aria-live="polite">{visibleLabel}</span>}
      <DownloadProgressTrack state={batchState} />
    </Button>
  );
}

export function DownloadStatusIcon({
  state,
  batch,
  className,
}: {
  state: MediaDownloadActionState;
  batch: boolean;
  className?: string;
}) {
  const iconClass = cn("h-4 w-4 shrink-0", className);
  if (state.status === "running") {
    return <Loader2 className={cn(iconClass, "animate-spin motion-reduce:animate-none")} aria-hidden="true" />;
  }
  if (state.status === "success") return <Check className={iconClass} aria-hidden="true" />;
  if (state.status === "error") return <RotateCcw className={iconClass} aria-hidden="true" />;
  return batch
    ? <Archive className={iconClass} aria-hidden="true" />
    : <Download className={iconClass} aria-hidden="true" />;
}

function DownloadProgressTrack({ state }: { state: MediaDownloadActionState }) {
  if (state.status !== "running") return null;
  const percent = state.progress?.percent ?? null;
  return (
    <span className="studio-media-download-progress" aria-hidden="true">
      <span
        className={cn(percent === null && "studio-media-download-progress-indeterminate")}
        style={percent === null ? undefined : { width: `${Math.max(4, percent)}%` }}
      />
    </span>
  );
}
