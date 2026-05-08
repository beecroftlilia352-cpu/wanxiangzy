import {
  getConfiguredPublicBaseUrl,
  normalizePublicBaseUrl,
  requirePublicBaseUrlForRuntime,
} from "@/lib/env";

const MAX_DATA_URL_LENGTH = 21 * 1024 * 1024;

export async function resolveImageInputs(input: {
  clothingUrls: string[];
  referenceUrl?: string;
  modelFaceUrl?: string;
}, options: {
  publicBaseUrl?: string | null;
} = {}): Promise<{
  clothingUrls: string[];
  referenceUrl?: string;
  modelFaceUrl?: string;
}> {
  const publicBaseUrl = normalizePublicBaseUrl(
    options.publicBaseUrl || getConfiguredPublicBaseUrl()
  );

  const [clothingUrls, referenceUrl, modelFaceUrl] = await Promise.all([
    Promise.all(input.clothingUrls.map((src) => resolveImageInput(src, publicBaseUrl))),
    input.referenceUrl ? resolveImageInput(input.referenceUrl, publicBaseUrl) : undefined,
    input.modelFaceUrl ? resolveImageInput(input.modelFaceUrl, publicBaseUrl) : undefined,
  ]);

  return { clothingUrls, referenceUrl, modelFaceUrl };
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

async function resolveImageInput(src: string, publicBaseUrl?: string): Promise<string> {
  if (typeof src !== "string" || !src.trim()) {
    throw new Error("Invalid image input");
  }

  if (src.startsWith("data:")) {
    if (src.length > MAX_DATA_URL_LENGTH) {
      throw new Error("Image data is too large");
    }
    return src;
  }

  if (!src.startsWith("/")) return src;

  return resolvePublicImageUrl(src, publicBaseUrl);
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
