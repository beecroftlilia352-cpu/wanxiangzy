import {
  getConfiguredPublicBaseUrl,
  normalizePublicBaseUrl,
  requirePublicBaseUrlForRuntime,
} from "@/lib/env";
import { assertRemoteImageUrlAllowed } from "@/lib/api/remote-image-fetch";
import { createAliyunOssRegistryReadUrl } from "@/lib/api/media-storage";
import { getAdminClient } from "@/lib/supabase/admin";
import { normalizeResourceLibraryLookupUrl } from "@/lib/api/general-image-inputs.server";

const MAX_DATA_URL_LENGTH = 21 * 1024 * 1024;

export async function resolveImageInputs(input: {
  clothingUrls: string[];
  referenceUrl?: string;
  referenceUrls?: string[];
  modelFaceUrl?: string;
}, options: {
  publicBaseUrl?: string | null;
  ownerUserId?: string;
} = {}): Promise<{
  clothingUrls: string[];
  referenceUrl?: string;
  referenceUrls?: string[];
  modelFaceUrl?: string;
}> {
  const publicBaseUrl = normalizePublicBaseUrl(
    options.publicBaseUrl || getConfiguredPublicBaseUrl()
  );

  const [clothingUrls, referenceUrls, modelFaceUrl] = await Promise.all([
    Promise.all(input.clothingUrls.map((src) => resolveMediaInput(src, {
      publicBaseUrl,
      ownerUserId: options.ownerUserId,
      expectedKind: "image",
    }))),
    Promise.all((input.referenceUrls?.length ? input.referenceUrls : input.referenceUrl ? [input.referenceUrl] : [])
      .map((src) => resolveMediaInput(src, {
        publicBaseUrl,
        ownerUserId: options.ownerUserId,
        expectedKind: "image",
      }))),
    input.modelFaceUrl ? resolveMediaInput(input.modelFaceUrl, {
      publicBaseUrl,
      ownerUserId: options.ownerUserId,
      expectedKind: "image",
    }) : undefined,
  ]);

  return { clothingUrls, referenceUrl: referenceUrls[0], referenceUrls, modelFaceUrl };
}

export function getPublicBaseUrlFromRequest(request: Request): string {
  const configured = requirePublicBaseUrlForRuntime("Resolving public image URLs");
  if (configured) return configured;

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (host) {
    const protocol = forwardedProto || new URL(request.url).protocol.replace(/:$/, "") || "https";
    const forwardedOrigin = normalizePublicBaseUrl(`${protocol}://${host}`);
    if (forwardedOrigin) return forwardedOrigin;
  }

  return new URL(request.url).origin;
}

export async function resolveMediaInput(
  src: string,
  options: {
    publicBaseUrl?: string | null;
    ownerUserId?: string;
    expectedKind: "audio" | "image" | "video";
  },
): Promise<string> {
  if (typeof src !== "string" || !src.trim()) {
    throw new Error(`Invalid ${options.expectedKind} input`);
  }

  const publicBaseUrl = normalizePublicBaseUrl(
    options.publicBaseUrl || getConfiguredPublicBaseUrl(),
  );
  const mediaAssetId = extractCanonicalMediaAssetId(src, publicBaseUrl);
  if (mediaAssetId) {
    return resolveVerifiedMediaAssetForWorker(
      mediaAssetId,
      options.ownerUserId,
      options.expectedKind,
    );
  }

  if (src.startsWith("data:")) {
    if (options.expectedKind !== "image") {
      throw new Error(`${options.expectedKind} data URLs are not allowed`);
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error("Production media inputs must use a canonical tenant asset");
    }
    if (src.length > MAX_DATA_URL_LENGTH) {
      throw new Error("Image data is too large");
    }
    return src;
  }

  if (!src.startsWith("/")) {
    // Reject http/https URLs that resolve to private/loopback/link-local/cloud
    // metadata addresses. Without this guard an authenticated user could
    // submit `http://169.254.169.254/...` to exfiltrate cloud metadata, or
    // `http://127.0.0.1:5432/...` to probe internal services. The DNS check
    // is applied here, before the URL is forwarded to the upstream
    // image-gen API (which itself calls `fetch` server-side). Local
    // filesystem paths are not affected.
    if (/^https?:\/\//i.test(src)) {
      if (
        process.env.NODE_ENV === "production"
        && !isTrustedProductionSiteAssetUrl(src)
        && !(await isOwnedResourceLibraryImageUrl(src, options.ownerUserId))
      ) {
        throw new Error("Production media inputs must use a canonical tenant asset");
      }
      await assertRemoteImageUrlAllowed(new URL(src));
    }
    return src;
  }

  if (options.expectedKind !== "image") {
    throw new Error(`Local ${options.expectedKind} paths are not allowed`);
  }
  return resolvePublicImageUrl(src, publicBaseUrl);
}

/**
 * Accept a raw OSS reference only when it is a server-written row in the
 * caller's own resource library. This lets legacy uploads/generation results
 * (stored before the media-asset registry migration) keep working as inputs
 * without ever trusting arbitrary client-supplied remote URLs.
 */
async function isOwnedResourceLibraryImageUrl(
  url: string,
  ownerUserId: string | undefined,
): Promise<boolean> {
  if (!ownerUserId) return false;
  const exact = url.trim();
  const normalized = normalizeResourceLibraryLookupUrl(url);
  const candidates = exact === normalized ? [exact] : [exact, normalized];
  const { data, error } = await getAdminClient()
    .from("resource_library_assets")
    .select("id")
    .eq("user_id", ownerUserId)
    .eq("media_type", "image")
    .in("storage_state", ["active", "migration_pending"])
    .eq("moderation_status", "allowed")
    .is("deleted_at", null)
    .in("url", candidates)
    .limit(1)
    .maybeSingle();
  return !error && Boolean(data);
}

function isTrustedProductionSiteAssetUrl(value: string) {
  const publicBase = process.env.ALIYUN_OSS_PUBLIC_BASE_URL?.trim();
  const prefix = process.env.ALIYUN_OSS_SITE_ASSET_PREFIX?.trim().replace(/^\/+|\/+$/g, "");
  if (!publicBase || !prefix) return false;
  try {
    const candidate = new URL(value);
    const configured = new URL(publicBase);
    const pathname = decodeURIComponent(candidate.pathname);
    return candidate.protocol === "https:"
      && candidate.origin === configured.origin
      && (pathname === `/${prefix}` || pathname.startsWith(`/${prefix}/`));
  } catch {
    return false;
  }
}

function extractCanonicalMediaAssetId(src: string, publicBaseUrl?: string) {
  let pathname: string;
  if (src.startsWith("/")) {
    if (src.startsWith("//")) return null;
    pathname = src.split(/[?#]/, 1)[0];
  } else {
    if (!publicBaseUrl) return null;
    try {
      const candidate = new URL(src);
      if (candidate.origin !== new URL(publicBaseUrl).origin) return null;
      pathname = candidate.pathname;
    } catch {
      return null;
    }
  }
  return pathname.match(/^\/api\/media-assets\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\/?$/i)?.[1] || null;
}

async function resolveVerifiedMediaAssetForWorker(
  assetId: string,
  ownerUserId: string | undefined,
  expectedKind: "audio" | "image" | "video",
) {
  if (!ownerUserId) {
    throw new Error("Canonical media inputs require an owner fence");
  }
  const { data, error } = await getAdminClient().rpc(
    "resolve_verified_media_asset_for_worker",
    {
      p_asset_id: assetId,
      p_expected_owner_user_id: ownerUserId,
    },
  );
  const row = Array.isArray(data) && data[0] && typeof data[0] === "object"
    ? data[0] as Record<string, unknown>
    : null;
  const mimeType = typeof row?.mime_type === "string" ? row.mime_type.toLowerCase() : "";
  if (
    error
    || !row
    || typeof row.bucket_name !== "string"
    || typeof row.object_key !== "string"
    || !mimeType.startsWith(`${expectedKind}/`)
  ) {
    throw new Error("Media asset is unavailable, unverified, or owned by another tenant");
  }
  return createAliyunOssRegistryReadUrl(row.object_key, row.bucket_name);
}

function resolvePublicImageUrl(src: string, publicBaseUrl?: string): string {
  if (!publicBaseUrl) {
    throw new Error("Public image paths need a configured public site URL");
  }

  const safePath = getSafePublicPath(src);
  if (!isSupportedImagePath(safePath)) {
    throw new Error("Unsupported local image type");
  }

  return new URL(src, publicBaseUrl).toString();
}

function getSafePublicPath(src: string): string {
  if (src.startsWith("//")) {
    throw new Error("Protocol-relative image paths are not allowed");
  }

  const rawPath = src.split("?")[0].replace(/^\/+/, "");
  let decodedPath: string;

  try {
    decodedPath = decodeURIComponent(rawPath);
  } catch {
    throw new Error("Invalid image path encoding");
  }

  if (
    !decodedPath ||
    decodedPath.includes("\0") ||
    decodedPath.includes("\\") ||
    decodedPath.split(/[\\/]/).includes("..")
  ) {
    throw new Error("Image path is outside public assets");
  }

  return decodedPath;
}

function isSupportedImagePath(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    lower.endsWith(".webp") ||
    lower.endsWith(".gif")
  );
}
