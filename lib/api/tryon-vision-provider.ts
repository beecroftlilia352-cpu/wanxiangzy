import { getLlmFallbackConfigs } from "@/lib/api/llm-provider";
import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";

export type TryOnVisionProviderConfig = {
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export type TryOnVisionFallbackReason =
  | "missing_api_key"
  | "provider_http_401"
  | "provider_http_403"
  | "provider_http_429"
  | "provider_http_error"
  | "provider_timeout"
  | "provider_network_error"
  | "provider_empty_content"
  | "provider_parse_error"
  | "provider_error";

export const TRYON_VISION_FALLBACK_REASON_TEXT: Record<TryOnVisionFallbackReason, string> = {
  missing_api_key: "参考图识别服务未配置，已按原图构图保守处理",
  provider_http_401: "参考图识别服务鉴权失败，已按原图构图保守处理",
  provider_http_403: "参考图识别服务无访问权限，已按原图构图保守处理",
  provider_http_429: "参考图识别服务繁忙限流，已按原图构图保守处理",
  provider_http_error: "参考图识别服务异常，已按原图构图保守处理",
  provider_timeout: "参考图识别超时，已按原图构图保守处理",
  provider_network_error: "参考图识别网络异常，已按原图构图保守处理",
  provider_empty_content: "参考图识别返回为空，已按原图构图保守处理",
  provider_parse_error: "参考图识别结果格式异常，已按原图构图保守处理",
  provider_error: "参考图识别未成功，已按原图构图保守处理",
};

export class TryOnVisionProviderError extends Error {
  reason: TryOnVisionFallbackReason;
  status?: number;

  constructor(reason: TryOnVisionFallbackReason, message: string, status?: number) {
    super(message);
    this.name = "TryOnVisionProviderError";
    this.reason = reason;
    this.status = status;
  }
}

export async function buildTryOnReferenceVisionProviderConfigs(defaultBaseUrl: string, defaultModel: string): Promise<TryOnVisionProviderConfig[]> {
  return uniqueProviderConfigs([
    {
      label: "tryon-reference",
      apiKey: readEnv("TRYON_REFERENCE_ANALYZE_API_KEY"),
      baseUrl: normalizeProviderBaseUrl(readEnv("TRYON_REFERENCE_ANALYZE_BASE_URL")),
      model: readEnv("TRYON_REFERENCE_ANALYZE_MODEL"),
    },
    {
      label: "tryon-clothing",
      apiKey: readEnv("TRYON_CLOTHING_ANALYZE_API_KEY"),
      baseUrl: normalizeProviderBaseUrl(readEnv("TRYON_CLOTHING_ANALYZE_BASE_URL")),
      model: readEnv("TRYON_CLOTHING_ANALYZE_MODEL"),
    },
    ...(await getTryOnVisionFallbackConfigs()).map((config) => ({
      label: config.provider,
      apiKey: config.apiKey,
      baseUrl: normalizeProviderBaseUrl(config.baseUrl),
      model: config.model,
    })),
    {
      label: "xiaomi-default",
      apiKey: readEnv("XIAOMI_MIMO_API_KEY"),
      baseUrl: normalizeProviderBaseUrl("https://api.xiaomimimo.com/v1"),
      model: readEnv("XIAOMI_MIMO_VISION_MODEL") || readEnv("XIAOMI_MIMO_MODEL") || defaultModel,
    },
  ], defaultBaseUrl, defaultModel);
}

export async function buildTryOnClothingVisionProviderConfigs(defaultBaseUrl: string, defaultModel: string): Promise<TryOnVisionProviderConfig[]> {
  return uniqueProviderConfigs([
    {
      label: "tryon-clothing",
      apiKey: readEnv("TRYON_CLOTHING_ANALYZE_API_KEY"),
      baseUrl: normalizeProviderBaseUrl(readEnv("TRYON_CLOTHING_ANALYZE_BASE_URL")),
      model: readEnv("TRYON_CLOTHING_ANALYZE_MODEL"),
    },
    ...(await getTryOnVisionFallbackConfigs()).map((config) => ({
      label: config.provider,
      apiKey: config.apiKey,
      baseUrl: normalizeProviderBaseUrl(config.baseUrl),
      model: config.model,
    })),
    {
      label: "xiaomi-default",
      apiKey: readEnv("XIAOMI_MIMO_API_KEY"),
      baseUrl: normalizeProviderBaseUrl("https://api.xiaomimimo.com/v1"),
      model: readEnv("XIAOMI_MIMO_VISION_MODEL") || readEnv("XIAOMI_MIMO_MODEL") || defaultModel,
    },
  ], defaultBaseUrl, defaultModel);
}

async function getTryOnVisionFallbackConfigs() {
  return (await getLlmFallbackConfigs("vision")).filter((config) => config.provider !== "lingya");
}

export function toTryOnVisionFallbackReason(error: unknown): TryOnVisionFallbackReason {
  if (error instanceof TryOnVisionProviderError) return error.reason;
  if (error instanceof DOMException && error.name === "AbortError") return "provider_timeout";
  const message = error instanceof Error ? error.message : String(error || "");
  if (/aborted|timeout|timed out/i.test(message)) return "provider_timeout";
  if (/fetch failed|network|ECONN|ENOTFOUND|ETIMEDOUT/i.test(message)) return "provider_network_error";
  return "provider_error";
}

export function getTryOnVisionFallbackReasonText(reason: TryOnVisionFallbackReason | null | undefined) {
  return TRYON_VISION_FALLBACK_REASON_TEXT[reason || "provider_error"];
}

function readEnv(name: string): string {
  return resolveEnvValue(process.env[name]);
}

function resolveEnvValue(value: string | undefined, seen = new Set<string>()): string {
  const trimmed = (value || "").trim();
  const match = trimmed.match(/^\$\{?([A-Z0-9_]+)\}?$/);
  if (!match) return trimmed;
  const name = match[1];
  if (seen.has(name)) return "";
  seen.add(name);
  return resolveEnvValue(process.env[name], seen);
}

function normalizeProviderBaseUrl(value: string) {
  return value ? normalizeOpenAiCompatibleBaseUrl(value) : "";
}

function uniqueProviderConfigs(
  configs: TryOnVisionProviderConfig[],
  defaultBaseUrl: string,
  defaultModel: string
): TryOnVisionProviderConfig[] {
  const seen = new Set<string>();
  const normalizedDefaultBaseUrl = normalizeProviderBaseUrl(defaultBaseUrl);
  const normalizedDefaultModel = defaultModel.trim();
  return configs
    .map((config) => ({
      label: config.label,
      apiKey: config.apiKey.trim(),
      baseUrl: config.baseUrl || normalizedDefaultBaseUrl,
      model: config.model.trim() || normalizedDefaultModel,
    }))
    .filter((config) => config.apiKey && config.baseUrl && config.model)
    .filter((config) => {
      const key = [
        config.baseUrl,
        config.model,
        config.apiKey.slice(0, 10),
        config.apiKey.slice(-6),
      ].join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}
