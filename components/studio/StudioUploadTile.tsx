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
  libraryLabel = "从作品选择",
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
            {loading ? <Loader2 className="h-6 w-6 animate-spin text-violet-500" /> : <ImageIcon className="h-6 w-6 text-violet-500" />}
          </span>
          <span className="text-sm font-black text-slate-800">{title}</span>
          {description && <span className="mt-1 max-w-[280px] text-center text-[12px] leading-5 text-slate-500">{description}</span>}
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
          {footnote && <span className="mt-2 max-w-[300px] text-center text-[11px] leading-4 text-slate-400">{footnote}</span>}
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
