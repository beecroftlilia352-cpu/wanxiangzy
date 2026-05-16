import { getImageVariantUrl, type ImageVariant } from "@/lib/image-variants";

type ImgSkeletonProps = {
  src: string;
  alt?: string;
  className?: string;
  variant?: ImageVariant | false;
};

export function ImgSkeleton({ src, alt, className, variant = "thumb" }: ImgSkeletonProps) {
  const displaySrc = variant ? getImageVariantUrl(src, variant) : src;

  return (
    <div className={`${className} bg-gray-100`}>
      <img
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
