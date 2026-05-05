import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

const REQUEST_TIMEOUT_MS = 300000;
const MAX_IMAGE_DATA_URL_LENGTH = 21 * 1024 * 1024;
const DEFAULT_ALLOWED_API_HOSTS = ["value.apiqik.online", "hk-api.gptbest.vip", "api.bltcy.ai", "api.whatai.cc"];

type ImageSize = "1K" | "2K" | "4K";
type ImageQuality = "auto" | "low" | "medium" | "high";

type RequestBody = {
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  prompt?: string;
  images?: string[];
  aspectRatio?: string;
  imageSize?: ImageSize;
  quality?: ImageQuality;
};

export async function POST(request: Request) {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });

    const body = await request.json() as RequestBody;
    const apiUrl = normalizeApiUrl(body.apiUrl);
    const apiKey = body.apiKey?.trim();
    const model = body.model?.trim();
    const prompt = body.prompt?.trim();
    const images = (body.images || []).map((image) => image.trim()).filter(Boolean);
    const aspectRatio = normalizeAspectRatio(body.aspectRatio);
    const requestedImageSize = normalizeImageSize(body.imageSize);
    const quality = normalizeQuality(body.quality);

    if (!apiUrl) return NextResponse.json({ error: "请输入 API URL" }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: "请输入 API Key" }, { status: 400 });
    if (!model) return NextResponse.json({ error: "请选择或输入模型" }, { status: 400 });
    if (!prompt) return NextResponse.json({ error: "请输入提示词" }, { status: 400 });
    if (images.some((image) => image.length > MAX_IMAGE_DATA_URL_LENGTH)) {
      return NextResponse.json({ error: "参考图过大，请换小图测试" }, { status: 413 });
    }

    const startedAt = Date.now();
    const imageSize = resolveModelImageSize(model, requestedImageSize);
    const size = resolvePixelSize(imageSize, aspectRatio);
    const upstreamBody = buildGenerationsBody({
      model,
      prompt,
      images,
      size,
      aspectRatio,
      imageSize,
      quality,
    });

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(upstreamBody),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const responseText = await response.text();
    if (!response.ok) {
      return NextResponse.json({
        error: `上游接口失败: ${response.status}`,
        status: response.status,
        raw: safeJsonOrText(responseText),
        request_body: redactLargeFields(upstreamBody),
      }, { status: 502 });
    }

    const json = JSON.parse(responseText);
    const imageUrls = extractImageUrls(json);
    const b64Images = extractBase64Images(json);

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - startedAt,
      model: json.model || model,
      request_body: redactLargeFields(upstreamBody),
      image_urls: imageUrls,
      b64_images: b64Images,
      content: json.choices?.[0]?.message?.content || "",
      usage: json.usage || null,
      raw_preview: JSON.stringify(redactLargeFields(json)).slice(0, 4000),
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "测试请求失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function buildGenerationsBody(params: {
  model: string;
  prompt: string;
  images: string[];
  size: string;
  aspectRatio: string;
  imageSize: ImageSize;
  quality: ImageQuality;
}) {
  const body: Record<string, unknown> = {
    model: params.model,
    prompt: params.prompt,
    n: 1,
    size: params.size,
    aspect_ratio: params.aspectRatio,
    response_format: "url",
  };

  if (params.images.length > 0) body.image = params.images;
  if (supportsQualityParam(params.model)) body.quality = params.quality;
  if (supportsImageSizeParam(params.model)) {
    body.image_size = params.imageSize;
  }

  return body;
}

function supportsQualityParam(model: string) {
  return model.toLowerCase().startsWith("gpt-image-2");
}

function supportsImageSizeParam(model: string) {
  const normalized = model.toLowerCase();
  return normalized.startsWith("nano-banana") || normalized.startsWith("gemini-");
}

function resolveModelImageSize(model: string, fallback: ImageSize): ImageSize {
  const normalized = model.toLowerCase();
  if (normalized.endsWith("-4k")) return "4K";
  if (normalized.endsWith("-2k")) return "2K";
  return fallback;
}

function normalizeApiUrl(value: string | undefined) {
  const raw = value?.trim().replace(/\/+$/, "");
  if (!raw) return "";

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "";
  }

  if (!["http:", "https:"].includes(url.protocol)) return "";
  if (!isAllowedApiHost(url.hostname)) return "";
  if (url.pathname.endsWith("/images/generations")) return url.toString();

  const base = url.toString().replace(/\/+$/, "");
  const v1Base = base.endsWith("/v1") ? base : `${base}/v1`;
  return `${v1Base}/images/generations`;
}

function isAllowedApiHost(hostname: string) {
  const configured = (process.env.API_PLATFORM_TEST_ALLOWED_HOSTS || "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  const allowedHosts = configured.length > 0 ? configured : DEFAULT_ALLOWED_API_HOSTS;
  return allowedHosts.includes(hostname.toLowerCase());
}

function normalizeAspectRatio(value: unknown) {
  const allowed = ["auto", "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2", "4:5", "5:4", "21:9"];
  return typeof value === "string" && allowed.includes(value) ? value : "3:4";
}

function normalizeImageSize(value: unknown): ImageSize {
  return value === "2K" || value === "4K" ? value : "1K";
}

function normalizeQuality(value: unknown): ImageQuality {
  return value === "low" || value === "medium" || value === "high" ? value : "auto";
}

function resolvePixelSize(imageSize: ImageSize, aspectRatio: string) {
  if (aspectRatio === "auto") return "auto";

  const ratio = getAspectRatioValue(aspectRatio);
  const targetPixels: Record<ImageSize, number> = {
    "1K": 1024 * 1024,
    "2K": 2048 * 2048,
    "4K": 3840 * 2160,
  };

  return resolveConstrainedPixelSize(ratio, targetPixels[imageSize]);
}

function getAspectRatioValue(aspectRatio: string): number {
  const [width, height] = aspectRatio.split(":").map(Number);
  if (!width || !height) return 3 / 4;
  return width / height;
}

function resolveConstrainedPixelSize(ratio: number, targetPixels: number): string {
  const maxEdge = 3840;
  const minPixels = 655_360;
  const maxPixels = 8_294_400;
  const safeRatio = Math.min(Math.max(ratio, 1 / 3), 3);
  const clampedTarget = Math.min(Math.max(targetPixels, minPixels), maxPixels);

  let width = Math.sqrt(clampedTarget * safeRatio);
  let height = width / safeRatio;
  const scale = Math.min(maxEdge / width, maxEdge / height, 1);
  width *= scale;
  height *= scale;

  let roundedWidth = Math.max(16, Math.floor(width / 16) * 16);
  let roundedHeight = Math.max(16, Math.floor(height / 16) * 16);

  while (roundedWidth * roundedHeight > maxPixels || roundedWidth > maxEdge || roundedHeight > maxEdge) {
    roundedWidth = Math.max(16, roundedWidth - 16);
    roundedHeight = Math.max(16, Math.round((roundedWidth / safeRatio) / 16) * 16);
  }

  while (roundedWidth * roundedHeight < minPixels && roundedWidth < maxEdge && roundedHeight < maxEdge) {
    const nextWidth = Math.min(maxEdge, roundedWidth + 16);
    const nextHeight = Math.min(maxEdge, Math.round((nextWidth / safeRatio) / 16) * 16);
    if (nextWidth === roundedWidth && nextHeight === roundedHeight) break;
    roundedWidth = nextWidth;
    roundedHeight = nextHeight;
  }

  return `${roundedWidth}x${roundedHeight}`;
}

function extractImageUrls(json: Record<string, unknown>): string[] {
  const urls = new Set<string>();

  if (Array.isArray(json.data)) {
    for (const item of json.data) {
      if (item && typeof item === "object" && typeof (item as Record<string, unknown>).url === "string") {
        urls.add((item as Record<string, unknown>).url as string);
      }
    }
  }

  const choices = json.choices as Array<Record<string, unknown>> | undefined;
  const content = choices?.[0]?.message as Record<string, unknown> | undefined;
  if (typeof content?.content === "string") {
    const matches = content.content.matchAll(/https?:\/\/[^\s)'"<>]+/g);
    for (const match of matches) urls.add(match[0]);
  }

  return Array.from(urls);
}

function extractBase64Images(json: Record<string, unknown>): string[] {
  const images: string[] = [];
  if (Array.isArray(json.data)) {
    for (const item of json.data) {
      if (item && typeof item === "object") {
        const b64 = (item as Record<string, unknown>).b64_json;
        if (typeof b64 === "string") {
          images.push(b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`);
        }
      }
    }
  }
  return images;
}

function redactLargeFields(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactLargeFields);
  if (!value || typeof value !== "object") return value;

  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (typeof item === "string" && item.length > 500) {
      next[key] = `[${Math.round(item.length / 1024)}KB string]`;
    } else {
      next[key] = redactLargeFields(item);
    }
  }
  return next;
}

function safeJsonOrText(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text.slice(0, 2000);
  }
}
