export type ImageVariant = "thumb" | "card" | "preview" | "detail";

const OSS_IMAGE_VARIANTS: Record<ImageVariant, string> = {
  thumb: "image/resize,m_lfit,w_320/format,webp/quality,q_82",
  card: "image/resize,m_lfit,w_640/format,webp/quality,q_84",
  preview: "image/resize,m_lfit,w_1280/format,webp/quality,q_86",
  detail: "image/resize,m_lfit,w_2560/format,webp/quality,q_94",
};

const CONFIGURED_OSS_IMAGE_HOSTS = (process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

export function getImageVariantUrl(url: string | null | undefined, variant: ImageVariant = "thumb") {
  if (!url) return "";
  if (!isAliyunOssImageUrl(url)) {
    // canonical /api/media-assets/<uuid> 也支持缩略：由路由按 variant 302 到带
    // x-oss-process 的签名 OSS 地址，避免缩略图加载完整大图。
    if (isCanonicalMediaAssetUrl(url)) {
      const separator = url.includes("?") ? "&" : "?";
      return `${url}${separator}variant=${variant}`;
    }
    return url;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.set("x-oss-process", OSS_IMAGE_VARIANTS[variant]);
    return parsed.toString();
  } catch {
    return url;
  }
}

export function getOriginalImageUrl(url: string | null | undefined) {
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

export function isAliyunOssImageUrl(url: string) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!parsed.protocol.startsWith("http")) return false;
    if (host.endsWith(".aliyuncs.com") || host.includes(".oss-")) return true;
    return CONFIGURED_OSS_IMAGE_HOSTS.includes(host);
  } catch {
    return false;
  }
}

function isCanonicalMediaAssetUrl(url: string) {
  return /^\/?api\/media-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?:[/?#]|$)/i.test(url);
}
