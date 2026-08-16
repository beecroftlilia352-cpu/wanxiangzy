import { getImageVariantUrl, type ImageVariant } from "@/lib/image-variants";
import { RawPreviewImage } from "@/components/studio/RawPreviewImage";

type ImgSkeletonProps = {
  src: string;
  alt?: string;
  className?: string;
  variant?: ImageVariant | false;
};

export function ImgSkeleton({ src, alt, className, variant = "thumb" }: ImgSkeletonProps) {
  const displaySrc = variant ? getImageVariantUrl(src, variant) : src;

  return (
    <div className={`${className} bg-[var(--codex-surface-soft)]`}>
      <RawPreviewImage
        src={displaySrc}
        alt={alt || ""}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
        className="h-full w-full object-cover"
      />
    </div>
  );
}
