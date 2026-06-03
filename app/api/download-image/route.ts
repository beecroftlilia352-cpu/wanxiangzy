import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { createAliyunOssDownloadUrl } from "@/lib/api/image-storage";
import { rateLimitResponse } from "@/lib/api/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;
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
  "vastweargen-images.cn-hongkong.thepacificxxs.com",
  "images.vastweargen.com",
  "webstatic.aiproxy.vip",
  "oss.filenest.top",
  "yunwu.ai",
];
const downloadRateBuckets = new Map<string, { count: number; resetAt: number }>();

export async function GET(request: NextRequest) {
  const rateLimit = checkDownloadRateLimit(request);
  if (!rateLimit.ok) return downloadRateLimitResponse(rateLimit.retryAfterSeconds);

  const { response: authResponse } = await requireApiUser();
  if (authResponse) return authResponse;

  const imageUrl = request.nextUrl.searchParams.get("url");
  const filename = request.nextUrl.searchParams.get("filename") || "tryon-result.jpg";

  if (!imageUrl) {
    return NextResponse.json({ error: "Missing url" }, { status: 400 });
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(imageUrl);
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    return NextResponse.json({ error: "Unsupported url protocol" }, { status: 400 });
  }

  if (!isAllowedHost(parsedUrl.hostname)) {
    return NextResponse.json({ error: "Image host is not allowed" }, { status: 400 });
  }

  const aliyunOssDownloadUrl = createAliyunOssDownloadUrl(parsedUrl.toString(), filename);
  if (aliyunOssDownloadUrl) {
    const redirect = NextResponse.redirect(aliyunOssDownloadUrl, 302);
    redirect.headers.set("Cache-Control", "no-store");
    return redirect;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(parsedUrl.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (err: unknown) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    return NextResponse.json(
      { error: isTimeout ? "Image download timed out" : "Image download failed" },
      { status: isTimeout ? 504 : 502 }
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return NextResponse.json({ error: `Image download failed: ${response.status}` }, { status: 502 });
  }

  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    return NextResponse.json({ error: "Remote resource is not an image" }, { status: 400 });
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > MAX_DOWNLOAD_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  }

  if (!response.body) {
    return NextResponse.json({ error: "Image response body is empty" }, { status: 502 });
  }

  const headers = new Headers({
    "Content-Type": contentType,
    "Content-Disposition": getContentDisposition(filename),
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  if (contentLength > 0) headers.set("Content-Length", String(contentLength));

  return new NextResponse(limitDownloadStream(response.body, MAX_DOWNLOAD_BYTES), { headers });
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

function limitDownloadStream(body: ReadableStream<Uint8Array>, maxBytes: number) {
  let totalBytes = 0;
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      totalBytes += chunk.byteLength;
      if (totalBytes > maxBytes) {
        controller.error(new Error("Image is too large"));
        return;
      }
      controller.enqueue(chunk);
    },
  }));
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
