import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";

export const LLM_PROVIDERS_CONFIG_KEY = "llm.providers";

export type LlmKind = "text" | "vision";
export type LlmProviderResponseType = "openai-chat";
export type LlmProviderName = "minimax" | "xiaomi" | "yunwu" | "lingya";

export type LlmProviderOverride = {
  enabled: boolean;
  provider: LlmProviderName;
  baseUrl: string;
  apiKey?: string;
  upstreamModel: string;
  responseType: LlmProviderResponseType;
};

export type LlmProviderOverrides = Partial<Record<LlmKind, LlmProviderOverride>>;

const DEFAULT_BASE_URLS: Record<LlmProviderName, string> = {
  minimax: "https://api.minimaxi.com",
  xiaomi: "https://api.xiaomimimo.com/v1",
  yunwu: "https://yunwu.ai",
  lingya: "https://api.lingyaai.cn",
};

const DEFAULT_MODELS: Record<LlmProviderName, string> = {
  minimax: "MiniMax-M3",
  xiaomi: "mimo-v2.5-pro",
  yunwu: "gpt-5.4-nano",
  lingya: "gpt-4o-mini",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeLlmKind(value: unknown): LlmKind {
  return value === "text" ? "text" : "vision";
}

export function normalizeLlmProviderName(value: unknown): LlmProviderName {
  const token = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (token === "minimax") return "minimax";
  if (token === "xiaomi" || token === "mimo") return "xiaomi";
  if (token === "yunwu") return "yunwu";
  if (token === "lingya") return "lingya";
  return "minimax";
}

export function normalizeLlmProviderBaseUrl(value: string | undefined, provider: LlmProviderName): string {
  return normalizeOpenAiCompatibleBaseUrl(value || DEFAULT_BASE_URLS[provider]);
}

export function parseLlmProviderOverrides(value: unknown): LlmProviderOverrides {
  if (!isRecord(value)) return {};
  const container = isRecord(value.models) ? value.models : value;

  const out: LlmProviderOverrides = {};
  for (const kind of ["text", "vision"] as const) {
    const raw = container[kind];
    if (!isRecord(raw)) continue;

    const provider = normalizeLlmProviderName(raw.provider);
    const baseUrl = typeof raw.baseUrl === "string" && raw.baseUrl.trim()
      ? raw.baseUrl.trim()
      : DEFAULT_BASE_URLS[provider];
    const upstreamModel = typeof raw.upstreamModel === "string" && raw.upstreamModel.trim()
      ? raw.upstreamModel.trim()
      : DEFAULT_MODELS[provider];

    out[kind] = {
      enabled: raw.enabled !== false,
      provider,
      baseUrl,
      apiKey: typeof raw.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : undefined,
      upstreamModel,
      responseType: "openai-chat",
    };
  }
  return out;
}
