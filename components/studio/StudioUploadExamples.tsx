"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { getImageVariantUrl } from "@/lib/image-variants";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

export type StudioUploadTileExample = {
  url: string;
  title: string;
  previewUrls?: ReadonlyArray<string>;
};

type StudioUploadExamplesProps = {
  label?: string;
  images: StudioUploadTileExample[];
  disabled?: boolean;
  className?: string;
  onSelect: (image: StudioUploadTileExample) => void;
};

export function StudioUploadExamples({
  label = "试一试",
  images,
  disabled,
  className,
  onSelect,
}: StudioUploadExamplesProps) {
  const [hidden, setHidden] = useState(false);
  if (!images.length) return null;

  if (hidden) {
    return (
      <button
        type="button"
        className="studio-upload-tile-examples-toggle"
        onClick={() => setHidden(false)}
        disabled={disabled}
        aria-label="查看推荐示例"
      >
        <Eye className="h-3.5 w-3.5" />
        查看推荐示例
      </button>
    );
  }

  return (
    <div className={cn("studio-upload-tile-examples", className)}>
      <span className="studio-upload-tile-example-meta">
        <span className="studio-upload-tile-example-label">{label}</span>
        <button
          type="button"
          className="studio-upload-tile-example-eye"
          onClick={() => setHidden(true)}
          disabled={disabled}
          aria-label={`隐藏${label}`}
          title={`隐藏${label}`}
        >
          <Eye className="h-3 w-3" />
        </button>
      </span>
      <div className="studio-upload-tile-example-list studio-scrollbar-hide">
        {images.map((image) => {
          const previewUrls = image.previewUrls?.length ? image.previewUrls : [image.url];
          const isMulti = previewUrls.length > 1;
          return (
            <button
              key={`${image.title}-${image.url}`}
              type="button"
              onClick={() => onSelect(image)}
              disabled={disabled}
              className={cn("studio-upload-tile-example-thumb", isMulti && "studio-upload-tile-example-thumb-multi")}
              title={isMulti ? `${image.title} · ${previewUrls.length} 张` : image.title}
              aria-label={isMulti ? `套用${image.title}，共${previewUrls.length}张` : `套用${image.title}`}
            >
              {isMulti ? (
                <>
                  {previewUrls.slice(0, 6).map((previewUrl, index) => (
                    <span key={`${previewUrl}-${index}`} className="studio-upload-tile-example-cell">
                      <RawPreviewImage src={getImageVariantUrl(previewUrl, "thumb")} alt={`${image.title}${index + 1}`} />
                    </span>
                  ))}
                  <span className="studio-upload-tile-example-group-label">组合</span>
                </>
              ) : (
                <RawPreviewImage src={getImageVariantUrl(previewUrls[0], "thumb")} alt={image.title} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
