export type GeneratedImageResult = {
  url?: string | null;
  b64_json?: string | null;
};

export function normalizeGeneratedImageUrl(result: GeneratedImageResult): string {
  const url = typeof result.url === "string" ? result.url.trim() : "";
  if (url) {
    if (isHttpUrl(url) || isDataImageUrl(url)) return url;
    throw new Error("图片生成接口返回了无效图片地址");
  }

  const b64 = typeof result.b64_json === "string" ? result.b64_json.trim() : "";
  if (!b64) throw new Error("图片生成接口未返回结果 URL");
  if (isDataImageUrl(b64)) return b64;
  return `data:image/png;base64,${b64}`;
}

export function isRenderableImageUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const url = value.trim();
  return isHttpUrl(url) || isDataImageUrl(url);
}

function isHttpUrl(value: string) {
  return /^https?:\/\/\S+$/i.test(value);
}

function isDataImageUrl(value: string) {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=\s]+$/i.test(value);
}
