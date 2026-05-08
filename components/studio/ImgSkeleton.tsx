type ImgSkeletonProps = {
  src: string;
  alt?: string;
  className?: string;
};

export function ImgSkeleton({ src, alt, className }: ImgSkeletonProps) {
  return (
    <div className={`${className} bg-gray-100`}>
      <img src={src} alt={alt || ""} className="h-full w-full object-cover" />
    </div>
  );
}
