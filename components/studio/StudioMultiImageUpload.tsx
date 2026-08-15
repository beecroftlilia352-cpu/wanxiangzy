"use client";

import { ArrowLeft, ArrowRight, CirclePlus, FolderOpen, Images, Loader2, Trash2, Upload, X, ZoomIn } from "lucide-react";
import { useTranslations } from "next-intl";
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
  itemLabelPrefix,
  loading,
  disabled,
  isDragging,
  uploadLabel,
  libraryLabel,
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
  const t = useTranslations("Shared");
  const resolvedItemLabelPrefix = itemLabelPrefix ?? t("itemPrefixImage");
  const resolvedUploadLabel = uploadLabel ?? t("uploadFromLocal");
  const resolvedLibraryLabel = libraryLabel ?? t("librarySelect");
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
  const exampleLabel = examples?.label || t("tryIt");

  return (
    <div
      className={cn("studio-upload-tile studio-multi-image-upload", isDragging && "studio-upload-tile-dragging", className)}
      aria-busy={loading ? "true" : undefined}
    >
      <div className="studio-upload-tile-panel">
        {isDragging && (
          <div className="studio-multi-image-drag-overlay">
            {remaining > 0 ? t("dragReleaseAdd", { remaining }) : t("dragMaxReached", { maxCount })}
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
                <button type="button" onClick={onClear} disabled={disabled || loading} className="studio-multi-image-clear" aria-label={t("clearTitle", { title })}>
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("clear")}
                </button>
              )}
              <span className="studio-multi-image-count">{t("countUnit", { count, max: maxCount })}</span>
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
                    aria-label={t("previewItem", { prefix: resolvedItemLabelPrefix, index: index + 1 })}
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
                        aria-label={t("moveItemForward", { label: `${resolvedItemLabelPrefix}${index + 1}` })}
                        title={t("moveForward")}
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
                        aria-label={t("moveItemBackward", { label: `${resolvedItemLabelPrefix}${index + 1}` })}
                        title={t("moveBackward")}
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onPreview && (
                      <button type="button" onClick={() => onPreview(url, index)} className="studio-icon-button" aria-label={t("previewItem", { prefix: resolvedItemLabelPrefix, index: index + 1 })} title={t("preview")}>
                        <ZoomIn className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button type="button" onClick={() => onRemove(url, index)} disabled={disabled || loading} className="studio-icon-button studio-icon-button-danger" aria-label={t("removeItem", { label: `${resolvedItemLabelPrefix}${index + 1}` })} title={t("remove")}>
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
                  aria-label={t("continueUpload", { title })}
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CirclePlus className="h-5 w-5" />}
                  <span>{t("addImage")}</span>
                  <small>{t("canAddMore", { remaining })}</small>
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
              <span className="studio-multi-image-empty-badge">{t("maxCountBadge", { maxCount })}</span>
            </button>
          )}

          <div className="studio-multi-image-footer">
            <div className="studio-multi-image-footer-actions">
              {remaining > 0 && (
                <button type="button" onClick={onUploadClick} disabled={!canAdd} className="studio-upload-tile-primary">
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {loading ? t("uploading") : resolvedUploadLabel}
                </button>
              )}
              {onLibraryClick && (
                <button type="button" onClick={onLibraryClick} disabled={disabled || loading} className="studio-upload-tile-secondary">
                  <FolderOpen className="h-3.5 w-3.5" />
                  {resolvedLibraryLabel}
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
            <span>{t("uploadingDots")}</span>
          </div>
        </div>
      )}
    </div>
  );
}
