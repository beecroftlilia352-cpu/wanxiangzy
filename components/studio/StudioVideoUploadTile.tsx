"use client";

import { CirclePlus, FolderOpen, Loader2, Upload, Video, X } from "lucide-react";
import type { ReactNode } from "react";
import { StudioUploadTips, buildStudioUploadTips, type StudioUploadTip } from "@/components/studio/StudioUploadTips";

export type StudioVideoUploadTileProps = {
  title: string;
  description?: string;
  videoUrl?: string | null;
  isDragging?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onUploadClick: () => void;
  onLibraryClick?: () => void;
  onRemove?: () => void;
  uploadLabel?: string;
  libraryLabel?: string;
  loadingLabel?: string;
  supportBadge?: string;
  sourceLabel?: string;
  footnote?: string;
  videoRequirement?: string;
  tips?: StudioUploadTip[];
  tipsAction?: ReactNode;
  actions?: ReactNode;
};

export function StudioVideoUploadTile({
  title,
  description,
  videoUrl,
  isDragging,
  disabled,
  loading,
  onUploadClick,
  onLibraryClick,
  onRemove,
  uploadLabel = "从本地上传",
  libraryLabel = "从作品库选择",
  loadingLabel = "上传中...",
  supportBadge,
  sourceLabel,
  footnote,
  videoRequirement,
  tips,
  tipsAction,
  actions,
}: StudioVideoUploadTileProps) {
  const uploadTips = tips?.length
    ? tips
    : buildStudioUploadTips({
        title,
        description,
        footnote,
        imageRequirement: videoRequirement,
      });

  return (
    <div className={`studio-upload-tile ${isDragging ? "studio-upload-tile-dragging" : ""}`} aria-busy={loading ? "true" : undefined}>
      <div className="studio-upload-tile-panel">
        {supportBadge && !videoUrl && (
          <span className="studio-upload-tile-badge">{supportBadge}</span>
        )}

        {videoUrl ? (
          <div className="studio-upload-tile-main relative bg-slate-950">
            <video src={videoUrl} controls playsInline preload="metadata" className="h-full w-full object-contain" />
            {sourceLabel && (
              <span className="absolute left-3 top-3 rounded-full border border-white/20 bg-slate-950/70 px-2.5 py-1 text-[11px] font-black text-white shadow-sm backdrop-blur">
                {sourceLabel}
              </span>
            )}
          </div>
        ) : (
          <div className="studio-upload-tile-empty" aria-label={`上传${title}`}>
            <button
              type="button"
              onClick={onUploadClick}
              disabled={disabled || loading}
              className="studio-upload-tile-heading"
            >
              <span className="studio-upload-tile-icon">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CirclePlus className="h-4 w-4" />}
              </span>
              <span className="studio-upload-tile-title" title={title}>{title}</span>
            </button>
            {description && (
              <span className="studio-upload-tile-description" title={description}>
                {description}
              </span>
            )}
            <span className="studio-upload-tile-action-row">
              <button
                type="button"
                onClick={onUploadClick}
                disabled={disabled || loading}
                className="studio-upload-tile-primary"
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {loading ? loadingLabel : uploadLabel}
              </button>
              {onLibraryClick && (
                <button
                  type="button"
                  onClick={onLibraryClick}
                  disabled={disabled || loading}
                  className="studio-upload-tile-secondary"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  {libraryLabel}
                </button>
              )}
            </span>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/70 px-2.5 py-1 text-[11px] font-black text-slate-500">
              <Video className="h-3.5 w-3.5 text-[var(--codex-accent)]" />
              MP4 / MOV
            </span>
          </div>
        )}
      </div>

      <StudioUploadTips tips={uploadTips} action={tipsAction} />

      {videoUrl && (
        <div className="studio-upload-tile-actions">
          {onRemove && (
            <button type="button" onClick={onRemove} disabled={disabled || loading} className="studio-icon-button studio-icon-button-danger" aria-label={`删除${title}`} title={`删除${title}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {actions}
        </div>
      )}

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[inherit] bg-white/72 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3.5 py-2 text-xs font-black text-slate-700 shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--codex-accent)]" />
            <span>{loadingLabel}</span>
          </div>
        </div>
      )}
    </div>
  );
}
