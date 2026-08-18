import { MAX_GENERAL_IMAGE_REFERENCE_IMAGES } from "@/lib/general-image-config";

const INLINE_IMAGE_URL_PATTERN = /^data:image\//i;
const CANONICAL_MEDIA_PATH_PATTERN = /^\/api\/media-assets\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/?$/i;

export function isGeneralImageReferenceUrl(value: string): boolean {
  const candidate = value.trim();
  return /^https?:\/\//i.test(candidate)
    || INLINE_IMAGE_URL_PATTERN.test(candidate)
    || CANONICAL_MEDIA_PATH_PATTERN.test(candidate.split(/[?#]/, 1)[0]);
}

/**
 * Normalize general-image references before any credit debit or queue insert.
 * Inline data URLs remain available to development-only tooling, while a
 * production request must use a registered/canonical media asset URL.
 */
export function normalizeGeneralImageReferenceUrls(value: unknown): {
  urls: string[];
  hasInlineImage: boolean;
} {
  if (!Array.isArray(value)) return { urls: [], hasInlineImage: false };

  const urls: string[] = [];
  let hasInlineImage = false;
  for (const item of value) {
    const url = typeof item === "string" ? item.trim() : "";
    if (INLINE_IMAGE_URL_PATTERN.test(url)) {
      hasInlineImage = true;
      if (process.env.NODE_ENV === "production") continue;
    }
    if (isGeneralImageReferenceUrl(url)) {
      urls.push(url);
    }
  }

  return {
    urls: urls.slice(0, MAX_GENERAL_IMAGE_REFERENCE_IMAGES),
    hasInlineImage,
  };
}

/** Check nested outfit-fusion assets without accepting inline image payloads. */
export function containsInlineImageUrl(value: unknown): boolean {
  if (typeof value === "string") return INLINE_IMAGE_URL_PATTERN.test(value.trim());
  if (Array.isArray(value)) return value.some(containsInlineImageUrl);
  if (!value || typeof value !== "object") return false;
  return Object.values(value as Record<string, unknown>).some(containsInlineImageUrl);
}

/**
 * Production generation inputs are intentionally narrower than provider
 * inputs. The API accepts tenant-fenced media assets and immutable site
 * assets, but never arbitrary remote URLs supplied by a client.
 */
export function isAllowedProductionImageInput(value: string, publicBaseUrl?: string | null): boolean {
  const candidate = value.trim();
  if (!candidate || INLINE_IMAGE_URL_PATTERN.test(candidate)) return false;

  const candidatePath = candidate.split(/[?#]/, 1)[0];
  if (CANONICAL_MEDIA_PATH_PATTERN.test(candidatePath)) return true;

  if (publicBaseUrl) {
    try {
      const parsed = new URL(candidate, publicBaseUrl);
      const configuredApp = new URL(publicBaseUrl);
      if (parsed.origin === configuredApp.origin && CANONICAL_MEDIA_PATH_PATTERN.test(parsed.pathname)) return true;
    } catch {
      // Fall through to the immutable site-asset check below.
    }
  }

  const publicBase = process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim();
  const sitePrefix = process.env.ALIYUN_OSS_SITE_ASSET_PREFIX?.trim().replace(/^\/+|\/+$/g, "");
  if (!publicBase || !sitePrefix) return false;
  try {
    const parsed = new URL(candidate, publicBaseUrl || undefined);
    const configured = new URL(publicBase);
    const pathname = decodeURIComponent(parsed.pathname);
    return parsed.protocol === "https:"
      && parsed.origin === configured.origin
      && (pathname === `/${sitePrefix}` || pathname.startsWith(`/${sitePrefix}/`));
  } catch {
    return false;
  }
}

export function findDisallowedProductionImageInputs(value: unknown, publicBaseUrl?: string | null): string[] {
  const found: string[] = [];
  const visit = (item: unknown) => {
    if (typeof item === "string") {
      const candidate = item.trim();
      if (isGeneralImageReferenceUrl(candidate)
        && !isAllowedProductionImageInput(candidate, publicBaseUrl)) {
        found.push(candidate);
      }
      return;
    }
    if (Array.isArray(item)) {
      item.forEach(visit);
      return;
    }
    if (item && typeof item === "object") {
      Object.values(item as Record<string, unknown>).forEach(visit);
    }
  };
  visit(value);
  return Array.from(new Set(found));
}
