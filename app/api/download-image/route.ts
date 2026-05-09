import { NextRequest, NextResponse } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/api/rate-limit";

export const maxDuration = 30;

const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 15000;
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
];

export async function GET(request: NextRequest) {
  const auth = await requireApiUser();
  if (auth.response) return auth.response;

  const limit = await checkRateLimit(`download:${auth.user.id}`, 30, 60_000);
  if (!limit.ok) return rateLimitResponse(limit.retryAfterSeconds);

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

  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > MAX_DOWNLOAD_BYTES) {
    return NextResponse.json({ error: "Image is too large" }, { status: 413 });
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${sanitizeFilename(filename)}"`,
      "Cache-Control": "no-store",
    },
  });
}

function sanitizeFilename(value: string): string {
  return value.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) || "tryon-result.jpg";
}

function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return getAllowedHosts().some((pattern) => matchesHostPattern(host, pattern));
}

function getAllowedHosts(): string[] {
  const configuredHosts = (process.env.DOWNLOAD_IMAGE_ALLOWED_HOSTS || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  const supabaseHost = getHostname(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const aliyunOssPublicHost = getHostname(process.env.ALIYUN_OSS_PUBLIC_BASE_URL);
  return [
    ...DEFAULT_ALLOWED_HOSTS,
    ...(supabaseHost ? [supabaseHost] : []),
    ...(aliyunOssPublicHost ? [aliyunOssPublicHost] : []),
    ...configuredHosts,
  ];
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
