import { ImageIcon, Upload, X, ZoomIn } from "lucide-react";
import type { ReactNode } from "react";

export type StudioUploadTileProps = {
  title: string;
  description?: string;
  imageUrl?: string | null;
  imageAlt: string;
  isDragging?: boolean;
  disabled?: boolean;
  onUploadClick: () => void;
  onPreview?: () => void;
  onRemove?: () => void;
  actions?: ReactNode;
};

export function StudioUploadTile({
  title,
  description,
  imageUrl,
  imageAlt,
  isDragging,
  disabled,
  onUploadClick,
  onPreview,
  onRemove,
  actions,
}: StudioUploadTileProps) {
  const activate = imageUrl && onPreview ? onPreview : onUploadClick;

  return (
    <div className={`studio-upload-tile ${isDragging ? "studio-upload-tile-dragging" : ""}`}>
      <button
        type="button"
        onClick={activate}
        disabled={disabled}
        className="studio-upload-tile-main"
        aria-label={imageUrl ? `预览${title}` : `上传${title}`}
      >
        {imageUrl ? (
          <img src={imageUrl} alt={imageAlt} className="h-full w-full object-contain p-3" />
        ) : (
          <span className="flex flex-col items-center justify-center text-center">
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-sm">
              <ImageIcon className="h-6 w-6 text-violet-500" />
            </span>
            <span className="text-sm font-black text-slate-800">{title}</span>
            {description && <span className="mt-1 max-w-[220px] text-[11px] leading-4 text-slate-500">{description}</span>}
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-bold text-white">
              <Upload className="h-3.5 w-3.5" />
              本地上传
            </span>
          </span>
        )}
      </button>

      {imageUrl && (
        <div className="studio-upload-tile-actions">
          {onPreview && (
            <button type="button" onClick={onPreview} className="studio-icon-button" aria-label={`预览${title}`} title={`预览${title}`}>
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
          )}
          {onRemove && (
            <button type="button" onClick={onRemove} className="studio-icon-button" aria-label={`移除${title}`} title={`移除${title}`}>
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}
