import { FolderOpen, ImageIcon, Loader2, Upload, X, ZoomIn } from "lucide-react";
import type { ReactNode } from "react";
import { getImageVariantUrl } from "@/lib/image-variants";

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
  uploadLabel?: string;
  libraryLabel?: string;
  footnote?: string;
  actions?: ReactNode;
};

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
  uploadLabel = "从本地上传",
  libraryLabel = "从作品库选择",
  footnote,
  actions,
}: StudioUploadTileProps) {
  const activate = imageUrl && onPreview ? onPreview : onUploadClick;

  return (
    <div
      className={`studio-upload-tile ${isDragging ? "studio-upload-tile-dragging" : ""}`}
      onDragEnter={onDropFile ? (event) => event.preventDefault() : undefined}
      onDragOver={onDropFile ? (event) => event.preventDefault() : undefined}
      onDrop={onDropFile ? (event) => {
        event.preventDefault();
        if (!disabled) onDropFile(event.dataTransfer.files?.[0]);
      } : undefined}
    >
      {imageUrl ? (
        <button
          type="button"
          onClick={activate}
          disabled={disabled}
          className="studio-upload-tile-main"
          aria-label={`预览${title}`}
        >
          <img src={getImageVariantUrl(imageUrl, "card")} alt={imageAlt} className="h-full w-full object-contain p-3" />
        </button>
      ) : (
        <div className="studio-upload-tile-empty" aria-label={`上传${title}`}>
          <span className="studio-upload-tile-icon">
            {loading ? <Loader2 className="h-6 w-6 animate-spin text-[var(--codex-accent)]" /> : <ImageIcon className="h-6 w-6 text-[var(--codex-accent)]" />}
          </span>
          <span className="studio-upload-tile-title text-sm font-black leading-snug text-codex-ink" title={title}>{title}</span>
          {description && (
            <span className="studio-upload-tile-description mt-1.5 text-center text-[12px] leading-5 text-codex-muted" title={description}>
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
              <Upload className="h-3.5 w-3.5" />
              {loading ? "上传中" : uploadLabel}
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
          {footnote && <span className="studio-upload-tile-footnote mt-2.5 text-center text-[11px] leading-5 text-codex-faint" title={footnote}>{footnote}</span>}
        </div>
      )}

      {imageUrl && (
        <div className="studio-upload-tile-actions">
          {onPreview && (
            <button type="button" onClick={onPreview} className="studio-icon-button" aria-label={`放大${title}`} title={`放大${title}`}>
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className="studio-icon-button studio-icon-button-danger" aria-label={`删除${title}`} title={`删除${title}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
