"use client";

import { ArrowLeft, ArrowRight, CirclePlus, FolderOpen, Loader2, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getImageVariantUrl } from "@/lib/image-variants";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type { StudioUploadTileExample } from "@/components/studio/StudioUploadExamples";
import { StudioUploadTips, buildStudioUploadTips, type StudioUploadTip } from "@/components/studio/StudioUploadTips";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

export type MultiImageUploadV2Props = {
  urls: string[];
  maxCount: number;
  /** 主标题（如「参考图」），用作 section title（紫色 marker）和上传框内文 */
  title: string;
  /** 上传框内的副标题（如「多视角商品图」），会拼到「上传」之后 */
  emptyHint?: string;
  /**
   * 是否显示「试一试」示例行。开启时下方展示 sample images；关闭时不显示。
   * 默认 true（保持向后兼容）。
   */
  showExamples?: boolean;
  /** 上传框下方的可选描述文本（如批量任务引导链接）。默认不显示。 */
  descriptionSlot?: React.ReactNode;
  /** 上传计数：「已上传 N/M」格式 */
  countLabel?: string;
  /** 上传框右上角「最多 N 张」徽标 */
  maxCountBadge?: string;
  /** 默认 tips 文本（仅当未提供 tips 时生效） */
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
  className?: string;
  imageFit?: "contain" | "cover";
  onUploadClick: () => void;
  onLibraryClick?: () => void;
  onPreview?: (url: string, index: number) => void;
  onRemove: (url: string, index: number) => void;
  onMove?: (fromIndex: number, toIndex: number) => void;
  /** 清空全部图片回调。清空按钮自带确认弹框。 */
  onClear?: () => void;
  examples?: {
    label?: string;
    images: StudioUploadTileExample[];
    disabled?: boolean;
    onSelect: (image: StudioUploadTileExample) => void;
  };
};

/**
 * 多图上传控件 v2 — 与单图上传配色统一，标题采用比例选择器同款紫色 marker。
 *
 * 支持两种样式：
 * - showExamples=true：空态下方展示「试一试」示例行（适用于 face-swap 等需要 sample 的模块）
 * - showExamples=false：空态不显示示例（适用于 image-translation 等），可配 descriptionSlot
 *
 * 清空按钮自带确认弹框；tips 根据状态切换位置（空态在底部、有图在顶部）。
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
  const showPanel = !hasImages || remaining > 0; // 满后隐藏 panel
  const resolvedCountLabel =
    countLabel ?? t("multiImageCount", { count, max: maxCount });
  const resolvedMaxBadge = maxCountBadge ?? t("maxCountBadge", { maxCount });
  const uploadTips = tips?.length
    ? tips
    : buildStudioUploadTips({
      title,
      description,
      footnote,
      imageRequirement,
    });
  const shouldShowExamples = showExamples && Boolean(examples?.images.length);
  const exampleLabel = examples?.label || t("tryIt");

  const handleClearClick = () => {
    if (!onClear) return;
    confirm({
      title: t("multiImageClearTitle"),
      content: t("multiImageClearContent"),
      okText: t("multiImageClearOk"),
      cancelText: t("multiImageClearCancel"),
      onOk: () => onClear(),
    });
  };

  // panel 内容（空态 / 续传 / 隐藏）
  const renderPanel = () => {
    if (!showPanel) return null;
    return (
      <div className="studio-upload-tile-panel studio-multi-image-v2-panel">
        {isDragging && (
          <div className="studio-multi-image-drag-overlay">
            {remaining > 0 ? t("dragReleaseAdd", { remaining }) : t("dragMaxReached", { maxCount })}
          </div>
        )}

        <div className="studio-multi-image-v2-panel-inner">
          <button
            type="button"
            onClick={onUploadClick}
            disabled={disabled || loading}
            className="studio-multi-image-v2-empty"
            aria-label={t("upload", { title })}
          >
            <span className="studio-multi-image-v2-empty-icon">
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <CirclePlus className="h-5 w-5" />}
            </span>
            <span className="studio-multi-image-v2-empty-title">
              {hasImages
                ? t("multiImageContinue")
                : emptyHint
                  ? t("uploadHintWithSuffix", { hint: emptyHint })
                  : t("multiImageUploadDefault")}
            </span>
          </button>

          {onLibraryClick && (
            <span
              role="button"
              tabIndex={disabled || loading ? -1 : 0}
              aria-disabled={disabled || loading || undefined}
              onClick={(e) => {
                if (disabled || loading) return;
                e.stopPropagation();
                onLibraryClick();
              }}
              onKeyDown={(e) => {
                if (disabled || loading) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onLibraryClick();
                }
              }}
              className="studio-multi-image-v2-library-pill"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              {resolvedLibraryLabel}
            </span>
          )}

          {!isFull && (
            <span className="studio-multi-image-v2-max-badge">{resolvedMaxBadge}</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <>
      <section
        className={cn("studio-upload-tile studio-multi-image-upload-v2", isDragging && "studio-upload-tile-dragging", className)}
        aria-busy={loading ? "true" : undefined}
      >
        <header className="studio-multi-image-v2-header">
          <h3 className="studio-multi-image-v2-title">
            <span aria-hidden="true" className="studio-multi-image-v2-title-mark" />
            <span className="studio-multi-image-v2-title-text">{title}</span>
          </h3>
        </header>

        {/* 空态：panel → description → examples → tips */}
        {!hasImages && (
          <>
            {renderPanel()}
            {descriptionSlot && (
              <div className="studio-multi-image-v2-description-slot">{descriptionSlot}</div>
            )}
            {shouldShowExamples && examples && (
              <div className="studio-multi-image-v2-examples-row">
                <span className="studio-multi-image-v2-examples-label">{exampleLabel}</span>
                <div className="studio-multi-image-v2-examples-grid">
                  {examples.images.slice(0, 6).map((image, i) => (
                    <button
                      key={image.url || `example-${i}`}
                      type="button"
                      disabled={disabled || loading || examples.disabled}
                      onClick={() => examples.onSelect(image)}
                      className="studio-multi-image-v2-example"
                      aria-label={image.title || exampleLabel}
                    >
                      <RawPreviewImage
                        src={getImageVariantUrl(image.url, "card")}
                        alt={image.title || ""}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <StudioUploadTips tips={uploadTips} />
          </>
        )}

        {/* 有图：tips → panel(续传) → count/clear → grid */}
        {hasImages && (
          <>
            <StudioUploadTips tips={uploadTips} />
            {renderPanel()}
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
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("clear")}
                </button>
              )}
            </div>

            <div className={cn("studio-multi-image-v2-grid", maxCount > 4 ? "studio-multi-image-v2-grid-dense" : "studio-multi-image-v2-grid-roomy")}>
              {urls.map((url, index) => (
                <div key={`${url}-${index}`} className="studio-multi-image-v2-card">
                  <button
                    type="button"
                    className="studio-multi-image-v2-preview"
                    onClick={() => onPreview?.(url, index)}
                    disabled={disabled || !onPreview}
                    aria-label={t("previewItem", { prefix: resolvedItemLabelPrefix, index: index + 1 })}
                  >
                    <RawPreviewImage
                      src={getImageVariantUrl(url, "card")}
                      alt={`${itemLabelPrefix}${index + 1}`}
                      className={cn("studio-multi-image-v2-img", imageFit === "cover" ? "object-cover" : "object-contain p-1.5")}
                    />
                  </button>
                  <span className="studio-multi-image-v2-index">{itemLabelPrefix}{index + 1}</span>
                  <div className="studio-multi-image-v2-actions">
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
                    <button
                      type="button"
                      onClick={() => onRemove(url, index)}
                      disabled={disabled || loading}
                      className="studio-icon-button studio-icon-button-danger"
                      aria-label={t("removeItem", { label: `${resolvedItemLabelPrefix}${index + 1}` })}
                      title={t("remove")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {summary && <span className="studio-multi-image-v2-summary">{summary}</span>}
      </section>

      {confirmDialog}

      {loading && (
        <div className="pointer-events-none fixed inset-0 z-[5] flex items-center justify-center rounded-[inherit] bg-white/62 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 rounded-full border border-white/80 bg-white/95 px-3.5 py-2 text-xs font-black text-codex-ink shadow-[0_14px_36px_rgba(15,23,42,0.16)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--codex-accent)]" />
            <span>{t("uploadingDots")}</span>
          </div>
        </div>
      )}
    </>
  );
}