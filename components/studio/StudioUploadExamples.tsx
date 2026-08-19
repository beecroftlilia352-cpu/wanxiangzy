"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { getImageVariantUrl } from "@/lib/image-variants";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  label,
  images,
  disabled,
  className,
  onSelect,
}: StudioUploadExamplesProps) {
  const t = useTranslations("Shared");
  const resolvedLabel = label ?? t("tryIt");
  const [hidden, setHidden] = useState(false);
  if (!images.length) return null;

  if (hidden) {
    return (
      <button
        type="button"
        className="studio-upload-tile-examples-toggle"
        onClick={() => setHidden(false)}
        disabled={disabled}
        aria-label={t("uploadExamplesToggle")}
      >
        <Eye className="h-3.5 w-3.5" />
        {t("uploadExamplesToggle")}
      </button>
    );
  }

  return (
    <div className={cn("studio-upload-tile-examples", className)}>
      <span className="studio-upload-tile-example-meta">
        <span className="studio-upload-tile-example-label">{resolvedLabel}</span>
        <button
          type="button"
          className="studio-upload-tile-example-eye"
          onClick={() => setHidden(true)}
          disabled={disabled}
          aria-label={t("hideLabel", { label: resolvedLabel })}
          title={t("hideLabel", { label: resolvedLabel })}
        >
          <Eye className="h-3 w-3" />
        </button>
      </span>
      <TooltipProvider delayDuration={140} skipDelayDuration={60}>
        <div className="studio-upload-tile-example-list studio-scrollbar-hide">
          {images.map((image) => {
            const previewUrls = image.previewUrls?.length ? image.previewUrls : [image.url];
            const isMulti = previewUrls.length > 1;
            const ariaLabel = isMulti
              ? t("applyExamplesMulti", { title: image.title, count: previewUrls.length })
              : t("applyExamples", { title: image.title });
            return (
              <Tooltip key={`${image.title}-${image.url}`}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => onSelect(image)}
                    disabled={disabled}
                    className={cn("studio-upload-tile-example-thumb", isMulti && "studio-upload-tile-example-thumb-multi")}
                    aria-label={ariaLabel}
                  >
                    {isMulti ? (
                      <>
                        {previewUrls.slice(0, 6).map((previewUrl, index) => (
                          <span key={`${previewUrl}-${index}`} className="studio-upload-tile-example-cell">
                            <RawPreviewImage eager src={getImageVariantUrl(previewUrl, "thumb")} alt={`${image.title}${index + 1}`} />
                          </span>
                        ))}
                        <span className="studio-upload-tile-example-group-label">{t("combo")}</span>
                      </>
                    ) : (
                      <RawPreviewImage eager src={getImageVariantUrl(previewUrls[0], "thumb")} alt={image.title} />
                    )}
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="bottom"
                  align="center"
                  sideOffset={10}
                  collisionPadding={16}
                  className={cn("studio-upload-example-preview-popover", isMulti && "studio-upload-example-preview-popover-multi")}
                >
                  <span className="studio-upload-example-preview-grid" data-count={Math.min(previewUrls.length, 6)}>
                    {previewUrls.slice(0, 6).map((previewUrl, index) => (
                      <span key={`${previewUrl}-preview-${index}`} className="studio-upload-example-preview-media">
                        <RawPreviewImage
                          src={getImageVariantUrl(previewUrl, "card")}
                          alt={isMulti ? `${image.title}${index + 1}` : image.title}
                          className="h-full w-full object-contain"
                        />
                      </span>
                    ))}
                  </span>
                  <span className="studio-upload-example-preview-title">{image.title}</span>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
}
