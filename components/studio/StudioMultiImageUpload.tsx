"use client";

import { ArrowLeft, ArrowRight, CirclePlus, FolderOpen, Images, Loader2, Trash2, Upload, X, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { getImageVariantUrl } from "@/lib/image-variants";
import { StudioUploadExamples, type StudioUploadTileExample } from "@/components/studio/StudioUploadExamples";
import { StudioUploadTips, buildStudioUploadTips, type StudioUploadTip } from "@/components/studio/StudioUploadTips";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

export type StudioMultiImageUploadProps = {
  urls: string[];
  maxCount: number;
  title: string;
  emptyTitle: string;
  description?: string;
  emptyDescription?: string;
  itemLabelPrefix?: string;
  loading?: boolean;
  disabled?: boolean;
  isDragging?: boolean;
  uploadLabel?: string;
  libraryLabel?: string;
  summary?: string;
  footnote?: string;
  imageRequirement?: string;
  tips?: StudioUploadTip[];
  className?: string;
  imageFit?: "contain" | "cover";
  onUploadClick: () => void;
  onLibraryClick?: () => void;
  onPreview?: (url: string, index: number) => void;
  onRemove: (url: string, index: number) => void;
  onMove?: (fromIndex: number, toIndex: number) => void;
  onClear?: () => void;
  examples?: {
    label?: string;
    images: StudioUploadTileExample[];
    disabled?: boolean;
    onSelect: (image: StudioUploadTileExample) => void;
  };
};

export function StudioMultiImageUpload({
  urls,
  maxCount,
  title,
  emptyTitle,
  description,
  emptyDescription,
  itemLabelPrefix = "图",
  loading,
  disabled,
  isDragging,
  uploadLabel = "从本地上传",
  libraryLabel = "从作品选择",
  summary,
  footnote,
  imageRequirement,
  tips,
  className,
  imageFit = "contain",
  onUploadClick,
  onLibraryClick,
  onPreview,
  onRemove,
  onMove,
  onClear,
  examples,
}: StudioMultiImageUploadProps) {
  const count = urls.length;
  const hasImages = count > 0;
  const remaining = Math.max(maxCount - count, 0);
  const canAdd = remaining > 0 && !disabled && !loading;
  const uploadTips = tips?.length
    ? tips
    : buildStudioUploadTips({
      title: hasImages ? title : emptyTitle,
      description: hasImages ? description : emptyDescription || description,
      footnote,
      imageRequirement,
    });
  const exampleLabel = examples?.label || "试一试";

  return (
    <div
      className={cn("studio-upload-tile studio-multi-image-upload", isDragging && "studio-upload-tile-dragging", className)}
      aria-busy={loading ? "true" : undefined}
    >
      <div className="studio-upload-tile-panel">
        {isDragging && (
          <div className="studio-multi-image-drag-overlay">
            {remaining > 0 ? `松开上传图片，还可添加 ${remaining} 张` : `最多 ${maxCount} 张，请先移除一张`}
          </div>
        )}

        <div className="studio-multi-image-content">
          <div className="studio-multi-image-header">
            <div className="min-w-0">
              <p className="studio-multi-image-title">{hasImages ? title : emptyTitle}</p>
              <p className="studio-multi-image-description">
                {hasImages ? description : emptyDescription || description}
              </p>
            </div>
            <div className="studio-multi-image-header-actions">
              {hasImages && onClear && (
                <button type="button" onClick={onClear} disabled={disabled || loading} className="studio-multi-image-clear" aria-label={`清空${title}`}>
                  <Trash2 className="h-3.5 w-3.5" />
                  清空
                </button>
              )}
              <span className="studio-multi-image-count">{count}/{maxCount} 张</span>
            </div>
          </div>

          {hasImages ? (
            <div className={cn("studio-multi-image-grid", maxCount > 4 ? "studio-multi-image-grid-dense" : "studio-multi-image-grid-roomy")}>
              {urls.map((url, index) => (
                <div key={`${url}-${index}`} className="studio-multi-image-card">
                  <button
                    type="button"
                    className="studio-multi-image-preview"
                    onClick={() => onPreview?.(url, index)}
                    disabled={disabled || !onPreview}
                    aria-label={`预览${itemLabelPrefix}${index + 1}`}
                  >
                    <RawPreviewImage
                      src={getImageVariantUrl(url, "card")}
                      alt={`${itemLabelPrefix}${index + 1}`}
                      className={cn("studio-multi-image-img", imageFit === "cover" ? "object-cover" : "object-contain p-1.5")}
                    />
                  </button>
                  <span className="studio-multi-image-index">{itemLabelPrefix}{index + 1}</span>
                  <div className="studio-multi-image-actions">
                    {onMove && index > 0 && (
                      <button
                        type="button"
                        onClick={() => onMove(index, index - 1)}
                        disabled={disabled || loading}
                        className="studio-icon-button"
                        aria-label={`将${itemLabelPrefix}${index + 1}前移`}
                        title="前移"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onMove && index < urls.length - 1 && (
                      <button
                        type="button"
                        onClick={() => onMove(index, index + 1)}
                        disabled={disabled || loading}
                        className="studio-icon-button"
                        aria-label={`将${itemLabelPrefix}${index + 1}后移`}
                        title="后移"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onPreview && (
                      <button type="button" onClick={() => onPreview(url, index)} className="studio-icon-button" aria-label={`放大${itemLabelPrefix}${index + 1}`} title="预览">
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => onRemove(url, index)} disabled={disabled || loading} className="studio-icon-button studio-icon-button-danger" aria-label={`移除${itemLabelPrefix}${index + 1}`} title="移除">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {remaining > 0 && (
                <button
                  type="button"
                  onClick={onUploadClick}
                  disabled={!canAdd}
                  className="studio-multi-image-add-card"
                  aria-label={`继续上传${title}`}
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CirclePlus className="h-5 w-5" />}
                  <span>添加图片</span>
                  <small>还可 {remaining} 张</small>
                </button>
              )}
            </div>
          ) : (
            <button type="button" onClick={onUploadClick} disabled={disabled || loading} className="studio-multi-image-empty">
              <span className="studio-multi-image-empty-icon">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Images className="h-5 w-5" />}
              </span>
              <span className="studio-multi-image-empty-title">{emptyTitle}</span>
              <span className="studio-multi-image-empty-text">{emptyDescription || description}</span>
              <span className="studio-multi-image-empty-badge">最多 {maxCount} 张</span>
            </button>
          )}

          <div className="studio-multi-image-footer">
            <div className="studio-multi-image-footer-actions">
              {remaining > 0 && (
                <button type="button" onClick={onUploadClick} disabled={!canAdd} className="studio-upload-tile-primary">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {loading ? "上传中..." : uploadLabel}
                </button>
              )}
              {onLibraryClick && (
                <button type="button" onClick={onLibraryClick} disabled={disabled || loading} className="studio-upload-tile-secondary">
                  <FolderOpen className="h-3.5 w-3.5" />
                  {libraryLabel}
                </button>
              )}
            </div>
            {summary && <span className="studio-multi-image-summary">{summary}</span>}
          </div>

          {examples?.images.length ? (
            <StudioUploadExamples
              label={exampleLabel}
              images={examples.images}
              disabled={disabled || loading || examples.disabled}
              className="studio-multi-image-examples"
              onSelect={examples.onSelect}
            />
          ) : null}
        </div>
      </div>

      <StudioUploadTips tips={uploadTips} />

      {loading && (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center rounded-[inherit] bg-white/62 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3.5 py-2 text-xs font-black text-slate-700 shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--codex-accent)]" />
            <span>上传中...</span>
          </div>
        </div>
      )}
    </div>
  );
}
