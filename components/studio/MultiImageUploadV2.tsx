"use client";

import { ArrowLeft, ArrowRight, CirclePlus, Loader2, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getImageVariantUrl } from "@/lib/image-variants";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  StudioUploadExamples,
  type StudioUploadTileExample,
} from "@/components/studio/StudioUploadExamples";
import {
  StudioUploadTips,
  buildStudioUploadTips,
  type StudioUploadTip,
} from "@/components/studio/StudioUploadTips";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

export type MultiImageUploadV2Props = {
  urls: string[];
  maxCount: number;
  title: string;
  emptyHint?: string;
  showExamples?: boolean;
  descriptionSlot?: React.ReactNode;
  countLabel?: string;
  maxCountBadge?: string;
  description?: string;
  itemLabelPrefix?: string;
  loading?: boolean;
  disabled?: boolean;
  isDragging?: boolean;
  libraryLabel?: string;
  summary?: string;
  footnote?: string;
  imageRequirement?: string;
  tips?: StudioUploadTip[];
  tipsAction?: React.ReactNode;
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

/**
 * 通用多图上传控件。
 *
 * 视觉状态与业务状态一一对应：空态/未满态显示上传面板，满额态隐藏；
 * 已上传区域统一提供预览、移除、排序和带确认的清空操作。
 */
export function MultiImageUploadV2({
  urls,
  maxCount,
  title,
  emptyHint,
  showExamples = true,
  descriptionSlot,
  countLabel,
  maxCountBadge,
  description,
  itemLabelPrefix,
  loading,
  disabled,
  isDragging,
  libraryLabel,
  summary,
  footnote,
  imageRequirement,
  tips,
  tipsAction,
  className,
  imageFit = "contain",
  onUploadClick,
  onLibraryClick,
  onPreview,
  onRemove,
  onMove,
  onClear,
  examples,
}: MultiImageUploadV2Props) {
  const t = useTranslations("Shared");
  const { confirm, confirmDialog } = useConfirm();
  const resolvedItemLabelPrefix = itemLabelPrefix ?? t("itemPrefixImage");
  const resolvedLibraryLabel = libraryLabel ?? t("librarySelect");
  const count = urls.length;
  const hasImages = count > 0;
  const isFull = count >= maxCount;
  const remaining = Math.max(maxCount - count, 0);
  const resolvedCountLabel = countLabel ?? t("multiImageCount", { count, max: maxCount });
  const resolvedMaxBadge = maxCountBadge ?? t("maxCountBadge", { maxCount });
  const uploadTips = tips?.length
    ? tips
    : buildStudioUploadTips({ title, description, footnote, imageRequirement });
  const shouldShowExamples = !hasImages && showExamples && Boolean(examples?.images.length);
  const uploadTitle = hasImages
    ? emptyHint
      ? `${t("multiImageContinue")}【${emptyHint}】`
      : t("multiImageContinue")
    : emptyHint
      ? t("uploadHintWithSuffix", { hint: emptyHint })
      : t("multiImageUploadDefault");

  const handleClearClick = () => {
    if (!onClear) return;
    confirm({
      variant: "batch-clear",
      title: t("multiImageClearTitle"),
      content: t("multiImageClearContent"),
      okText: t("multiImageClearOk"),
      cancelText: t("multiImageClearCancel"),
      onOk: onClear,
    });
  };

  return (
    <>
      <section className={cn("studio-multi-image-upload-v2", className)}>
        <header className="studio-multi-image-v2-header">
          <h3 className="studio-multi-image-v2-title">
            <span aria-hidden="true" className="studio-multi-image-v2-title-mark" />
            <span className="studio-multi-image-v2-title-text">{title}</span>
          </h3>
        </header>

        <div
          className={cn(
            "studio-upload-tile studio-multi-image-v2-shell",
            isDragging && "studio-upload-tile-dragging",
          )}
          aria-busy={loading ? "true" : undefined}
        >
          {!isFull && (
            <div className="studio-upload-tile-panel studio-multi-image-v2-panel">
              {isDragging && (
                <div className="studio-multi-image-drag-overlay">
                  {t("dragReleaseAdd", { remaining })}
                </div>
              )}

              {!hasImages && (
                <span className="studio-multi-image-v2-max-badge">{resolvedMaxBadge}</span>
              )}

              <div className="studio-multi-image-v2-panel-inner">
                <button
                  type="button"
                  onClick={onUploadClick}
                  disabled={disabled || loading}
                  className="studio-multi-image-v2-upload"
                  aria-label={t("upload", { title })}
                >
                  <span className="studio-multi-image-v2-upload-icon" aria-hidden="true">
                    {loading ? <Loader2 className="animate-spin" /> : <CirclePlus />}
                  </span>
                  <span className="studio-multi-image-v2-upload-title">{uploadTitle}</span>
                </button>

                {onLibraryClick && (
                  <button
                    type="button"
                    disabled={disabled || loading}
                    onClick={(event) => {
                      event.stopPropagation();
                      onLibraryClick();
                    }}
                    className="studio-multi-image-v2-library-pill"
                  >
                    {resolvedLibraryLabel}
                  </button>
                )}

                {descriptionSlot && (
                  <div className="studio-multi-image-v2-description-slot">{descriptionSlot}</div>
                )}

                {shouldShowExamples && examples && (
                  <StudioUploadExamples
                    className="studio-multi-image-v2-examples"
                    label={examples.label}
                    images={examples.images}
                    disabled={disabled || loading || examples.disabled}
                    onSelect={examples.onSelect}
                  />
                )}
              </div>
            </div>
          )}

          <StudioUploadTips tips={uploadTips} action={tipsAction} />

          {hasImages && (
            <div className="studio-multi-image-v2-results">
              <div className="studio-multi-image-v2-meta">
                <span className="studio-multi-image-v2-count">{resolvedCountLabel}</span>
                {onClear && (
                  <button
                    type="button"
                    onClick={handleClearClick}
                    disabled={disabled || loading}
                    className="studio-multi-image-v2-clear"
                    aria-label={t("clearTitle", { title })}
                  >
                    <Trash2 aria-hidden="true" />
                    {t("clear")}
                  </button>
                )}
              </div>

              <div
                className={cn(
                  "studio-multi-image-v2-grid",
                  maxCount > 4
                    ? "studio-multi-image-v2-grid-dense"
                    : "studio-multi-image-v2-grid-roomy",
                )}
              >
                {urls.map((url, index) => {
                  const itemLabel = `${resolvedItemLabelPrefix}${index + 1}`;
                  return (
                    <div
                      key={`${url}-${index}`}
                      className="studio-multi-image-v2-card"
                      data-fit={imageFit}
                    >
                      <button
                        type="button"
                        className="studio-multi-image-v2-preview"
                        onClick={() => onPreview?.(url, index)}
                        disabled={disabled || !onPreview}
                        aria-label={t("previewItem", {
                          prefix: resolvedItemLabelPrefix,
                          index: index + 1,
                        })}
                      >
                        <RawPreviewImage
                          src={getImageVariantUrl(url, "card")}
                          alt={itemLabel}
                          className={cn(
                            "studio-multi-image-v2-img",
                            imageFit === "cover" ? "object-cover" : "object-contain",
                          )}
                        />
                      </button>
                      <span className="studio-multi-image-v2-index">{itemLabel}</span>
                      <div className="studio-multi-image-v2-actions">
                        {onMove && index > 0 && (
                          <button
                            type="button"
                            onClick={() => onMove(index, index - 1)}
                            disabled={disabled || loading}
                            className="studio-multi-image-v2-card-action studio-multi-image-v2-move"
                            aria-label={t("moveItemForward", { label: itemLabel })}
                            title={t("moveForward")}
                          >
                            <ArrowLeft />
                          </button>
                        )}
                        {onMove && index < urls.length - 1 && (
                          <button
                            type="button"
                            onClick={() => onMove(index, index + 1)}
                            disabled={disabled || loading}
                            className="studio-multi-image-v2-card-action studio-multi-image-v2-move"
                            aria-label={t("moveItemBackward", { label: itemLabel })}
                            title={t("moveBackward")}
                          >
                            <ArrowRight />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onRemove(url, index)}
                          disabled={disabled || loading}
                          className="studio-multi-image-v2-card-action studio-multi-image-v2-remove"
                          aria-label={t("removeItem", { label: itemLabel })}
                          title={t("remove")}
                        >
                          <X />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {summary && <span className="studio-multi-image-v2-summary">{summary}</span>}

          {loading && (
            <div className="studio-multi-image-v2-loading" aria-live="polite">
              <div className="studio-multi-image-v2-loading-pill">
                <Loader2 className="animate-spin" />
                <span>{t("uploadingDots")}</span>
              </div>
            </div>
          )}
        </div>
      </section>

      {confirmDialog}
    </>
  );
}
