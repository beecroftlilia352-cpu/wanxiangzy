export type ImageVariant = "thumb" | "card" | "preview";

const OSS_IMAGE_VARIANTS: Record<ImageVariant, string> = {
  thumb: "image/resize,m_lfit,w_320/format,webp/quality,q_82",
  card: "image/resize,m_lfit,w_640/format,webp/quality,q_84",
  preview: "image/resize,m_lfit,w_1280/format,webp/quality,q_86",
};

const CONFIGURED_OSS_IMAGE_HOSTS = (process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS || "")
  .split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

export function getImageVariantUrl(url: string | null | undefined, variant: ImageVariant = "thumb") {
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
