const VIDEO_EXTENSION_PATTERN = /\.(mp4|mov|webm|m4v)(?:$|[?#])/i;
const IMAGE_EXTENSION_PATTERN = /\.(avif|gif|jpe?g|png|svg|webp)(?:$|[?#])/i;

export function isLikelyVideoUrl(value?: string | null) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (url.startsWith("data:video/")) return true;
  return VIDEO_EXTENSION_PATTERN.test(url);
}

export function isLikelyImageUrl(value?: string | null) {
  const url = String(value || "").trim();
  if (!url) return false;
  if (url.startsWith("data:image/")) return true;
  return IMAGE_EXTENSION_PATTERN.test(url);
}

export function inferMediaExtension(url: string, fallback = "mp4") {
  const clean = url.split(/[?#]/)[0]?.toLowerCase() || "";
  const match = clean.match(/\.([a-z0-9]{2,5})$/i);
  if (!match?.[1]) return fallback;
  const ext = match[1] === "jpeg" ? "jpg" : match[1];
  return ext || fallback;
}
