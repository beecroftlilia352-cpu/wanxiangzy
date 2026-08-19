export type ImageVariant = "thumb" | "card" | "preview" | "detail";

// x-oss-process pipeline strings. Aliyun OSS applies them on the edge when
// image processing is enabled on the bucket. Sizes are tuned for the studio
// UI; quality is intentionally a touch low for thumbs to keep file size down.
const OSS_IMAGE_VARIANTS: Record<ImageVariant, string> = {
  thumb: "image/resize,m_lfit,w_320/format,webp/quality,q_82",
  card: "image/resize,m_lfit,w_640/format,webp/quality,q_84",
  preview: "image/resize,m_lfit,w_1280/format,webp/quality,q_86",
  detail: "image/resize,m_lfit,w_2560/format,webp/quality,q_94",
};

/**
 * Append `x-oss-process` to a direct OSS URL so the bucket returns a resized
 * WebP instead of the original 4K JPEG. The caller should pair this with
 * `images.unoptimized` (or rely on `images.unoptimized: true` in
 * next.config.ts) so next/image never rewrites the URL through `/_next/image`,
 * which would force Sharp to re-process server-side and reintroduce the OOM
 * on the 1.9G EC2 box.
 *
 * Non-OSS URLs (signed `/api/media-assets/<uuid>` URLs, local paths,
 * non-aliyuncs.com hosts) pass through unchanged.
 */
export function getImageVariantUrl(
  url: string | null | undefined,
  variant: ImageVariant = "thumb",
): string {
  if (!url) return "";
  if (!isAliyunOssImageUrl(url)) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.set("x-oss-process", OSS_IMAGE_VARIANTS[variant]);
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Strip any existing x-oss-process so we can hand the browser the raw
 * original (e.g. for full-resolution previews on lightbox close).
 */
export function getOriginalImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (!isAliyunOssImageUrl(url)) return url;

  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("x-oss-process");
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Match direct OSS URLs (public or signed) so we can route them through
 * x-oss-process instead of next/image. Excludes the canonical
 * `/api/media-assets/<uuid>` proxy (which the web server signs with
 * x-oss-process itself) and any non-HTTP source.
 */
export function isAliyunOssImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!parsed.protocol.startsWith("http")) return false;
    return host.endsWith(".aliyuncs.com") || host.includes(".oss-");
  } catch {
    return false;
  }
}
