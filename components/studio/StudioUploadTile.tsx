"use client";

import { CirclePlus, FolderOpen, Loader2, Upload, X, ZoomIn } from "lucide-react";
import { useRef, useState, type DragEvent, type ReactNode } from "react";
import { getImageVariantUrl } from "@/lib/image-variants";
import type { StableFileDragContext } from "@/components/studio/useStableFileDrag";
import { StudioUploadExamples, type StudioUploadTileExample } from "@/components/studio/StudioUploadExamples";
import { StudioUploadTips, buildStudioUploadTips, type StudioUploadTip } from "@/components/studio/StudioUploadTips";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

export type StudioUploadTileProps = {
  title: string;
  description?: string;
  imageUrl?: string | null;
  imageAlt: string;
  isDragging?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onUploadClick: () => void;
  onLibraryClick?: () => void;
  onPreview?: () => void;
  onRemove?: () => void;
  onDropFile?: (file?: File) => void;
  dragContext?: StableFileDragContext;
  uploadLabel?: string;
  libraryLabel?: string;
  loadingLabel?: string;
  supportBadge?: string;
  footnote?: string;
  imageRequirement?: string;
  tips?: StudioUploadTip[];
  examples?: {
    label?: string;
    images: StudioUploadTileExample[];
    disabled?: boolean;
    onSelect: (image: StudioUploadTileExample) => void;
  };
  tipsAction?: ReactNode;
  actions?: ReactNode;
};

function hasFileDrag(event: DragEvent<HTMLElement>) {
  return Array.from(event.dataTransfer.types || []).includes("Files");
}

export function StudioUploadTile({
  title,
  description,
  imageUrl,
  imageAlt,
  isDragging,
  disabled,
  loading,
  onUploadClick,
  onLibraryClick,
  onPreview,
  onRemove,
  onDropFile,
  dragContext,
  uploadLabel = "从本地上传",
  libraryLabel = "从作品库选择",
  loadingLabel = "上传中...",
  supportBadge,
  footnote,
  imageRequirement,
  tips,
  examples,
  tipsAction,
  actions,
}: StudioUploadTileProps) {
  const activate = imageUrl && onPreview ? onPreview : onUploadClick;
  const hasExamples = Boolean(examples?.images.length);
  const [isFileOver, setIsFileOver] = useState(false);
  const dragDepthRef = useRef(0);
  const tileDragging = isDragging || isFileOver;
  const uploadTips = tips?.length
    ? tips
    : buildStudioUploadTips({ title, description, footnote, imageRequirement });

  const finishTileDrag = () => {
    dragDepthRef.current = 0;
    setIsFileOver(false);
    dragContext?.finishDragging();
  };

  return (
    <div
      className={`studio-upload-tile ${tileDragging ? "studio-upload-tile-dragging" : ""}`}
      aria-busy={loading ? "true" : undefined}
      onDragEnter={onDropFile ? (event) => {
        if (!hasFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (disabled || loading) return;
        dragDepthRef.current += 1;
        setIsFileOver(true);
        event.dataTransfer.dropEffect = "copy";
      } : undefined}
      onDragLeave={onDropFile ? (event) => {
        if (!hasFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        if (disabled || loading) return;
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) setIsFileOver(false);
      } : undefined}
      onDragOver={onDropFile ? (event) => {
        if (!hasFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
        if (!disabled && !loading) setIsFileOver(true);
      } : undefined}
      onDrop={onDropFile ? (event) => {
        if (!hasFileDrag(event)) return;
        event.preventDefault();
        event.stopPropagation();
        finishTileDrag();
        if (!disabled && !loading) onDropFile(event.dataTransfer.files?.[0]);
      } : undefined}
      onDragEnd={onDropFile ? (event) => {
        event.stopPropagation();
        finishTileDrag();
      } : undefined}
    >
      <div className="studio-upload-tile-panel">
        {supportBadge && !imageUrl && (
          <span className="studio-upload-tile-badge">{supportBadge}</span>
        )}

        {imageUrl ? (
          <button
            type="button"
            onClick={activate}
            disabled={disabled || loading}
            className="studio-upload-tile-main"
            aria-label={`预览${title}`}
          >
            <RawPreviewImage src={getImageVariantUrl(imageUrl, "card")} alt={imageAlt} className="h-full w-full object-contain p-3" />
          </button>
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
            {description && !hasExamples && (
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

            {hasExamples && (
              <StudioUploadExamples
                label={examples?.label}
                images={examples?.images || []}
                disabled={disabled || loading || examples?.disabled}
                onSelect={(image) => examples?.onSelect(image)}
              />
            )}
          </div>
        )}
      </div>

      <StudioUploadTips tips={uploadTips} action={tipsAction} />

      {imageUrl && (
        <div className="studio-upload-tile-actions">
          {onPreview && (
            <button type="button" onClick={onPreview} disabled={disabled || loading} className="studio-icon-button" aria-label={`放大${title}`} title={`放大${title}`}>
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          )}
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
