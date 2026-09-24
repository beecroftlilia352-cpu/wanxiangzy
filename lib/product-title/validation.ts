import { PRODUCT_TITLE_IMAGE_URL_MAX_LENGTH } from "@/lib/product-title/types";

/**
 * 校验「商品标题」接口的入参：非空字符串、长度受限，且必须是
 * 站内相对路径（/api/media-assets/<id> 等）或 http(s) 绝对地址（含内网绝对地址）。
 * 协议相对地址（//host）直接拒绝。
 *
 * 注意：这个函数刻意放在 lib/ 而不是路由文件里 —— Next.js 会校验
 * app/api 下 route.ts 的导出字段，只允许 HTTP 方法等，额外导出会让 next build 失败。
 */
export function readImageUrl(body: unknown): string | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const raw = (body as { imageUrl?: unknown }).imageUrl;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > PRODUCT_TITLE_IMAGE_URL_MAX_LENGTH) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.startsWith("/")) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}
