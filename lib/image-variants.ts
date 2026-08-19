export type ImageVariant = "thumb" | "card" | "preview" | "detail";

const VALID_VARIANTS: ReadonlySet<ImageVariant> = new Set([
  "thumb",
  "card",
  "preview",
  "detail",
]);

/**
 * Return a path on the local /api/oss-image route that will:
 *   1. validate the src host
 *   2. sign the OSS URL with the requested x-oss-process pipeline
 *   3. 302-redirect the browser to the signed URL so OSS does the resize
 *
 * Browsers fetch the API route, get 302'd to a signed OSS URL with
 * x-oss-process, and OSS returns a resized WebP inline. This avoids the
 * "Can not override response header for an anonymous user" error that
 * OSS returns for plain ?x-oss-process= on a public-read object, and
 * it also avoids running Sharp in the Next.js web process (which OOM'd
 * the 1.9G EC2 box).
 *
 * Non-OSS URLs pass through unchanged so we never break external hosts.
 */
export function getImageVariantUrl(
  url: string | null | undefined,
  variant: ImageVariant = "thumb",
): string {
  if (!url) return "";
  if (!isAliyunOssImageUrl(url)) return url;
  if (!VALID_VARIANTS.has(variant)) return url;

  const separator = url.includes("?") ? "&" : "?";
  // We pass the original src as a query param rather than putting it in the
  // path: aliyuncs.com object keys include slashes that would otherwise
  // need URL-encoding, and Next.js route handlers accept arbitrary query
  // strings cleanly. /api/oss-image re-validates the host on its side.
  return `/api/oss-image${separator}src=${encodeURIComponent(url)}&variant=${variant}`;
}

/**
 * Strip any existing x-oss-process from a direct OSS URL so we can hand
 * the browser the raw original (e.g. for full-resolution previews on
 * lightbox close).
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
 * the local /api/oss-image route. Excludes any non-HTTP source.
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
