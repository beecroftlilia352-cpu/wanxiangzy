import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { createAliyunOssDownloadUrl } from "@/lib/api/image-storage";
import { createAliyunOssRegistryReadUrl } from "@/lib/api/media-storage";
import { getAdminClient } from "@/lib/supabase/admin";
import { rateLimitResponse } from "@/lib/api/rate-limit";
import { fetchRemoteImageResponse, RemoteImageFetchError } from "@/lib/api/remote-image-fetch";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_DOWNLOAD_BYTES = 40 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const DOWNLOAD_RATE_LIMIT = 120;
const DOWNLOAD_RATE_WINDOW_MS = 60_000;
const DEFAULT_ALLOWED_HOSTS = [
  "*.supabase.co",
  "replicate.delivery",
  "*.fashn.ai",
  "fashn.ai",
  "*.lingyaai.cn",
  "lingyaai.cn",
  "*.sssai.vip",
  "sssai.vip",
  "i.ibb.co",
  "*.ibb.co",
  "*.oss-cn-hongkong.aliyuncs.com",
  "*.oss-cn-hangzhou.aliyuncs.com",
  "*.oss-cn-shanghai.aliyuncs.com",
  "vasthk.cn-hongkong.thepacificgls.com",
  "cn-hongkong.thepacificgls.com",
  "webstatic.aiproxy.vip",
  "oss.filenest.top",
  "yunwu.ai",
];
const downloadRateBuckets = new Map<string, { count: number; resetAt: number }>();

export async function GET(request: NextRequest) {
  const rateLimit = checkDownloadRateLimit(request);
  if (!rateLimit.ok) return downloadRateLimitResponse(rateLimit.retryAfterSeconds);

  const { supabase, user, response: authResponse } = await requireApiUser();
  if (authResponse) return authResponse;

  const imageUrl = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") || "tryon-result.jpg";
  const forceProxy = request.nextUrl.searchParams.get("proxy") === "1";
  const resolveOnly = request.nextUrl.searchParams.get("resolve") === "1";

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl, request.nextUrl.origin);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "Unsupported url protocol" }, { status: 400 });
  }

  const canonicalAssetMatch = parsedUrl.origin === request.nextUrl.origin
    ? parsedUrl.pathname.match(/^\/api\/media-assets\/([0-9a-f-]{36})$/i)
    : null;
  const isCanonicalAsset = Boolean(canonicalAssetMatch);
  if (canonicalAssetMatch) {
    const assetId = canonicalAssetMatch[1];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(assetId)) {
      return NextResponse.json({ error: "Invalid media asset" }, { status: 400 });
    }
    const { data: record } = await supabase
      .from("media_asset_records")
      .select("id,status")
      .eq("id", assetId)
      .maybeSingle();
    if (!record || record.status !== "verified") {
      return NextResponse.json({ error: "Media asset is not available" }, { status: 404 });
    }
    const { data, error } = await getAdminClient().rpc("resolve_verified_media_asset_for_worker", {
      p_asset_id: assetId,
      p_expected_owner_user_id: user.id,
    });
    const row = Array.isArray(data) && data[0] && typeof data[0] === "object"
      ? data[0] as { bucket_name?: unknown; object_key?: unknown }
      : null;
    if (error || !row || typeof row.bucket_name !== "string" || typeof row.object_key !== "string") {
      return NextResponse.json({ error: "Media asset is not available" }, { status: 404 });
    }
    parsedUrl = new URL(createAliyunOssRegistryReadUrl(row.object_key, row.bucket_name));
  } else if (parsedUrl.origin === request.nextUrl.origin || !isAllowedHost(parsedUrl.hostname)) {
    return NextResponse.json({ error: "Image host is not allowed" }, { status: 400 });
  }

  const aliyunOssDownloadUrl = createAliyunOssDownloadUrl(parsedUrl.toString(), filename);
  if (resolveOnly) {
    if (!isCanonicalAsset && aliyunOssDownloadUrl) {
      return NextResponse.json({ strategy: "direct", url: aliyunOssDownloadUrl });
    }
    const proxyUrl = new URL("/api/download-image", request.nextUrl.origin);
    proxyUrl.searchParams.set("url", parsedUrl.toString());
    proxyUrl.searchParams.set("filename", filename);
    proxyUrl.searchParams.set("proxy", "1");
    return NextResponse.json({ strategy: "proxy", url: proxyUrl.pathname + proxyUrl.search });
  }
  if (aliyunOssDownloadUrl && !forceProxy && !isCanonicalAsset) {
    const redirect = NextResponse.redirect(aliyunOssDownloadUrl, 302);
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  }
  const upstreamUrl = aliyunOssDownloadUrl || parsedUrl.toString();

  let download: Awaited<ReturnType<typeof fetchRemoteImageResponse>>;
  try {
    download = await fetchRemoteImageResponse(upstreamUrl, {
      allowHttp: true,
      allowedHosts: getAllowedHosts(),
      maxBytes: MAX_DOWNLOAD_BYTES,
      timeoutMs: DOWNLOAD_TIMEOUT_MS,
    });
  } catch (err: unknown) {
    return remoteImageErrorResponse(err);
  }
  if (!download.response.body) {
    return NextResponse.json({ error: "Image download failed" }, { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": download.contentType,
    "Content-Disposition": getContentDisposition(filename),
    "Cache-Control": "private, max-age=300",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  });
  if (download.contentLength > 0) {
    headers.set("Content-Length", String(download.contentLength));
  }

  return new NextResponse(limitResponseBody(download.response.body, MAX_DOWNLOAD_BYTES), { headers });
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "tryon-result.jpg";
}

function getContentDisposition(filename: string) {
  const safeFilename = sanitizeFilename(filename);
  return `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodeRFC5987ValueChars(safeFilename)}`;
}

function encodeRFC5987ValueChars(value: string) {
  return encodeURIComponent(value)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, "%2A");
}

function checkDownloadRateLimit(request: NextRequest) {
  const key = getClientIp(request);
  const now = Date.now();
  const existing = downloadRateBuckets.get(key);

  if (!existing || existing.resetAt <= now) {
    cleanupDownloadRateBuckets(now);
    downloadRateBuckets.set(key, { count: 1, resetAt: now + DOWNLOAD_RATE_WINDOW_MS });
    return { ok: true as const };
  }

  if (existing.count >= DOWNLOAD_RATE_LIMIT) {
    return {
      ok: false as const,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += 1;
  return { ok: true as const };
}

function downloadRateLimitResponse(retryAfterSeconds: number) {
  return rateLimitResponse(retryAfterSeconds, {
    label: "图片下载",
    limit: DOWNLOAD_RATE_LIMIT,
    windowMs: DOWNLOAD_RATE_WINDOW_MS,
  });
}

function cleanupDownloadRateBuckets(now: number) {
  if (downloadRateBuckets.size < 1000) return;
  for (const [key, bucket] of downloadRateBuckets) {
    if (bucket.resetAt <= now) downloadRateBuckets.delete(key);
  }
}

function getClientIp(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const firstForwarded = forwardedFor.split(",")[0]?.trim();
  return firstForwarded ||
    request.headers.get("x-real-ip") ||
    request.headers.get("cf-connecting-ip") ||
    "anonymous";
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return getAllowedHosts().some((pattern) => matchesHostPattern(host, pattern));
}

function getAllowedHosts(): string[] {
  const configuredHosts = parseHostList(process.env.DOWNLOAD_IMAGE_ALLOWED_HOSTS);
  const aliyunOssImageHosts = parseHostList(process.env.NEXT_PUBLIC_ALIYUN_OSS_IMAGE_HOSTS);

  const supabaseHost = getHostname(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const aliyunOssPublicHost = getHostname(process.env.ALIYUN_OSS_PUBLIC_BASE_URL);
  const aliyunOssDownloadHost = getHostname(process.env.ALIYUN_OSS_DOWNLOAD_BASE_URL);
  return [
    ...DEFAULT_ALLOWED_HOSTS,
    ...(supabaseHost ? [supabaseHost] : []),
    ...(aliyunOssPublicHost ? [aliyunOssPublicHost] : []),
    ...(aliyunOssDownloadHost ? [aliyunOssDownloadHost] : []),
    ...aliyunOssImageHosts,
    ...configuredHosts,
  ];
}

function parseHostList(value?: string) {
  return (value || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

function matchesHostPattern(host: string, pattern: string): boolean {
  if (pattern.startsWith("*.")) {
    const suffix = pattern.slice(1);
    return host.endsWith(suffix) && host.length > suffix.length;
  }

  return host === pattern;
}

function getHostname(value?: string): string | null {
  if (!value) return null;

  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function remoteImageErrorResponse(err: unknown) {
  if (err instanceof RemoteImageFetchError) {
    if (err.code === "timeout") {
      return NextResponse.json({ error: "Image download timed out" }, { status: 504 });
    }
    if (err.code === "too-large") {
      return NextResponse.json({ error: "Image is too large" }, { status: 413 });
    }
    if (err.code === "bad-status") {
      return NextResponse.json({ error: `Image download failed: ${err.status || "unknown"}` }, { status: 502 });
    }
    const clientErrorCodes = new Set([
      "blocked-address",
      "blocked-host",
      "invalid-url",
      "non-image",
      "redirect-limit",
      "unsupported-protocol",
    ]);
    if (clientErrorCodes.has(err.code)) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Image download failed" }, { status: 502 });
}

function limitResponseBody(body: ReadableStream<Uint8Array>, maxBytes: number) {
  let totalBytes = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        controller.error(new RemoteImageFetchError("remote image is too large", "too-large"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
}
