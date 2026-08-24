import { NextResponse } from "next/server";
import { API_RATE_LIMITS, enforceApiRateLimit } from "@/lib/api/rate-limit";
import { resolveExactAspectPixelSize } from "@/lib/api/image-size";
import { createServerSupabase } from "@/lib/supabase/server";

const REQUEST_TIMEOUT_MS = 300000;
const IMAGE_FETCH_TIMEOUT_MS = 60000;
const MAX_IMAGE_DATA_URL_LENGTH = 21 * 1024 * 1024;
const MAX_EDIT_IMAGE_COUNT = 15;
const MAX_EDIT_IMAGE_BYTES = 50 * 1024 * 1024;
const DEFAULT_ALLOWED_API_HOSTS = ["api.new.bi", "value.apiqik.online", "hk-api.gptbest.vip", "api.bltcy.ai", "api.whatai.cc"];

type ImageSize = "1K" | "2K" | "4K";
type ImageQuality = "auto" | "low" | "medium";

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

    const rateLimit = await enforceApiRateLimit(user.id, API_RATE_LIMITS.apiPlatformTestProxy);
    if (rateLimit) return rateLimit;

    const body = await request.json() as RequestBody;
    const apiKey = body.apiKey?.trim();
    const model = body.model?.trim();
    const prompt = body.prompt?.trim();
    const images = (body.images || []).map((image) => image.trim()).filter(Boolean);
    const useImageEditEndpoint = shouldUseImageEditEndpoint(model, images);
    const apiUrl = normalizeApiUrl(body.apiUrl, useImageEditEndpoint ? "edits" : "generations");
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
    if (images.length > MAX_EDIT_IMAGE_COUNT) {
      return NextResponse.json({ error: "参考图数量需少于 16 张" }, { status: 400 });
    }

    const startedAt = Date.now();
    const imageSize = resolveModelImageSize(model, requestedImageSize);
    const upstreamModel = resolveUpstreamImageModel(model);
    const size = resolvePixelSize(imageSize, aspectRatio);
    const upstreamRequest = useImageEditEndpoint
      ? await buildEditsRequest({
          model: upstreamModel,
          prompt,
          images,
          size,
          quality,
        })
      : buildGenerationsRequest({
          model: upstreamModel,
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
        ...upstreamRequest.headers,
      },
      body: upstreamRequest.body,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const responseText = await response.text();
    if (!response.ok) {
      const raw = safeJsonOrText(responseText);
      const upstreamError = extractUpstreamError(raw);
      return NextResponse.json({
        error: upstreamError ? `上游接口失败 ${response.status}: ${upstreamError}` : `上游接口失败: ${response.status}`,
        status: response.status,
        raw,
        request_body: redactLargeFields(upstreamRequest.preview),
      }, { status: 502 });
    }

    const json = JSON.parse(responseText);
    const imageUrls = extractImageUrls(json);
    const b64Images = extractBase64Images(json);

    return NextResponse.json({
      ok: true,
      elapsed_ms: Date.now() - startedAt,
      model: json.model || upstreamModel,
      selected_model: model,
      request_body: redactLargeFields(upstreamRequest.preview),
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

function buildGenerationsRequest(params: {
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

  return {
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    preview: body,
  };
}

async function buildEditsRequest(params: {
  model: string;
  prompt: string;
  images: string[];
  size: string;
  quality: ImageQuality;
}) {
  const form = new FormData();
  const files = await Promise.all(params.images.map(fetchImageForFormData));

  for (const file of files) {
    form.append("image", file.blob, file.filename);
  }
  form.append("prompt", params.prompt);
  form.append("model", params.model);
  form.append("n", "1");
  form.append("size", params.size);
  form.append("quality", params.quality);
  form.append("background", "auto");

  return {
    headers: { Accept: "application/json" },
    body: form,
    preview: {
      model: params.model,
      prompt: params.prompt,
      n: 1,
      size: params.size,
      quality: params.quality,
      background: "auto",
      image_count: params.images.length,
      endpoint: "/v1/images/edits",
    },
  };
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

function resolveUpstreamImageModel(model: string) {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("gpt-image-2")) return "gpt-image-2";
  return model;
}

function shouldUseImageEditEndpoint(model: string | undefined, images: string[]) {
  return Boolean(model && model.toLowerCase().startsWith("gpt-image-2") && images.length > 0);
}

function normalizeApiUrl(value: string | undefined, endpoint: "generations" | "edits") {
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
  if (/\/images\/(?:generations|edits)\/?$/i.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/images\/(?:generations|edits)\/?$/i, `/images/${endpoint}`);
    url.search = "";
    return url.toString();
  }

  const base = url.toString().replace(/\/+$/, "");
  const v1Base = base.endsWith("/v1") ? base : `${base}/v1`;
  return `${v1Base}/images/${endpoint}`;
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
  return value === "low" || value === "medium" ? value : "auto";
}

async function fetchImageForFormData(src: string, index: number): Promise<{ blob: Blob; filename: string }> {
  if (src.startsWith("data:")) return parseDataUrlImage(src, index);

  const response = await fetch(src, { signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS) });
  if (!response.ok) {
    throw new Error(`参考图 ${index + 1} 下载失败: ${response.status}`);
  }

  const contentType = normalizeImageContentType(response.headers.get("content-type"));
  if (!contentType) throw new Error(`参考图 ${index + 1} 不是支持的图片格式`);

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_EDIT_IMAGE_BYTES) {
    throw new Error(`参考图 ${index + 1} 超过 50MB`);
  }

  return {
    blob: new Blob([buffer], { type: contentType }),
    filename: buildImageFilename(src, contentType, index),
  };
}

function parseDataUrlImage(src: string, index: number): { blob: Blob; filename: string } {
  const match = src.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error(`参考图 ${index + 1} data URL 无效`);

  const contentType = normalizeImageContentType(match[1]);
  if (!contentType) throw new Error(`参考图 ${index + 1} 不是支持的图片格式`);

  const binary = Buffer.from(match[2], "base64");
  if (binary.byteLength > MAX_EDIT_IMAGE_BYTES) {
    throw new Error(`参考图 ${index + 1} 超过 50MB`);
  }

  return {
    blob: new Blob([binary], { type: contentType }),
    filename: `reference-${index + 1}.${extensionForContentType(contentType)}`,
  };
}

function normalizeImageContentType(value: string | null) {
  const contentType = (value || "").split(";")[0].trim().toLowerCase();
  if (["image/png", "image/jpeg", "image/jpg", "image/webp"].includes(contentType)) {
    return contentType === "image/jpg" ? "image/jpeg" : contentType;
  }
  return "";
}

function buildImageFilename(src: string, contentType: string, index: number) {
  try {
    const url = new URL(src);
    const name = url.pathname.split("/").filter(Boolean).pop();
    if (name && /\.[a-z0-9]+$/i.test(name)) return name;
  } catch {}
  return `reference-${index + 1}.${extensionForContentType(contentType)}`;
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

function resolvePixelSize(imageSize: ImageSize, aspectRatio: string) {
  return resolveExactAspectPixelSize(imageSize, aspectRatio);
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
  if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
    const url = (json.data as Record<string, unknown>).url;
    if (typeof url === "string") urls.add(url);
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
  const appendB64 = (value: unknown) => {
    if (typeof value === "string") {
      images.push(value.startsWith("data:") ? value : `data:image/png;base64,${value}`);
    }
  };
  if (Array.isArray(json.data)) {
    for (const item of json.data) {
      if (item && typeof item === "object") {
        appendB64((item as Record<string, unknown>).b64_json);
      }
    }
  }
  if (json.data && typeof json.data === "object" && !Array.isArray(json.data)) {
    appendB64((json.data as Record<string, unknown>).b64_json);
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

function extractUpstreamError(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value.trim().slice(0, 500);
  if (typeof value !== "object") return String(value).slice(0, 500);

  const record = value as Record<string, unknown>;
  const direct = [
    record.message,
    record.msg,
    record.detail,
    record.error_description,
  ].find((item) => typeof item === "string" && item.trim());
  if (typeof direct === "string") return direct.trim().slice(0, 500);

  const nested = record.error;
  if (typeof nested === "string") return nested.trim().slice(0, 500);
  if (nested && typeof nested === "object") {
    const nestedMessage = extractUpstreamError(nested);
    if (nestedMessage) return nestedMessage;
  }

  try {
    return JSON.stringify(value).slice(0, 500);
  } catch {
    return "";
  }
}
