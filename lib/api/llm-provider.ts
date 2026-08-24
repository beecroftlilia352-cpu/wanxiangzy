import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";
import type { LlmKind, LlmProviderName } from "@/lib/api/llm-provider-registry";

/**
 * Legacy configuration adapter retained for migration tooling and tests.
 * Production API routes must use llm-routing.server instead.
 */
export type LlmProvider = LlmProviderName;
export type LlmConfig = { provider: LlmProvider; apiKey: string; baseUrl: string; model: string };

const MINIMAX_DEFAULT_BASE_URL = "https://api.minimaxi.com";
const MINIMAX_DEFAULT_MODEL = "MiniMax-M3";
const XIAOMI_DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
const XIAOMI_DEFAULT_MODEL = "mimo-v2.5-pro";
const YUNWU_DEFAULT_BASE_URL = "https://yunwu.ai";
const YUNWU_DEFAULT_MODEL = "gpt-5.4-nano";
const LINGYA_DEFAULT_MODEL = "gpt-4o-mini";

/** @deprecated Use executeLlmChatRouted for production calls. */
export async function getLlmConfig(kind: LlmKind): Promise<LlmConfig> {
  if (process.env.NODE_ENV === "test") return getLegacyEnvLlmConfig(kind);
  const { getAdminLlmProviderOverride } = await import("@/lib/api/llm-provider-registry.server");
  const override = await getAdminLlmProviderOverride(kind);
  if (!override || override.enabled === false) throw new Error(`LLM ${kind} provider is not configured in admin`);
  const apiKey = override.apiKey?.trim();
  if (!apiKey) throw new Error(`LLM ${kind} provider API key is not configured in admin`);
  return { provider: override.provider, apiKey, baseUrl: normalizeOpenAiCompatibleBaseUrl(override.baseUrl), model: override.upstreamModel };
}

/** @deprecated Use the control-plane router, which owns fallback ordering. */
export async function getLlmFallbackConfigs(kind: LlmKind): Promise<LlmConfig[]> {
  const primary = await getLlmConfig(kind);
  if (process.env.NODE_ENV === "test") {
    const fallbackProvider = primary.provider === "xiaomi" ? "yunwu" : "xiaomi";
    const fallback = getLegacyEnvLlmConfigForProvider(fallbackProvider, kind);
    return [primary, fallback].filter((config) => config.apiKey && config.baseUrl && config.model);
  }
  return [primary].filter((config) => config.apiKey && config.baseUrl && config.model);
}

/** @deprecated Use the control-plane adapter. */
export function getChatCompletionsUrl(config: LlmConfig): string { return `${config.baseUrl}/chat/completions`; }

function getLegacyEnvLlmConfig(kind: LlmKind): LlmConfig {
  const provider = (process.env.ANALYZE_LLM_PROVIDER || "xiaomi").trim().toLowerCase();
  if (provider === "minimax" || provider === "yunwu" || provider === "lingya") return getLegacyEnvLlmConfigForProvider(provider, kind);
  return getLegacyEnvLlmConfigForProvider("xiaomi", kind);
}

function getLegacyEnvLlmConfigForProvider(provider: LlmProviderName, kind: LlmKind): LlmConfig {
  if (provider === "minimax") return {
    provider: "minimax", apiKey: process.env.MINIMAX_API_KEY || "", baseUrl: normalizeOpenAiCompatibleBaseUrl(process.env.MINIMAX_BASE_URL || MINIMAX_DEFAULT_BASE_URL),
    model: (kind === "vision" ? process.env.MINIMAX_VISION_MODEL : process.env.MINIMAX_TEXT_MODEL) || process.env.MINIMAX_MODEL || MINIMAX_DEFAULT_MODEL,
  };
  if (provider === "yunwu") return {
    provider: "yunwu", apiKey: process.env.YUNWU_API_KEY || "",
    baseUrl: normalizeOpenAiCompatibleBaseUrl(process.env.YUNWU_API_BASE_URL || YUNWU_DEFAULT_BASE_URL),
    model: (kind === "vision" ? process.env.YUNWU_VISION_MODEL || process.env.LINGYA_VISION_MODEL : process.env.YUNWU_TEXT_MODEL || process.env.LINGYA_TEXT_MODEL) || YUNWU_DEFAULT_MODEL,
  };
  if (provider === "lingya") return {
    provider: "lingya", apiKey: process.env.LINGYA_API_KEY || "", baseUrl: process.env.LINGYA_BASE_URL ? normalizeOpenAiCompatibleBaseUrl(process.env.LINGYA_BASE_URL) : "",
    model: (kind === "vision" ? process.env.LINGYA_VISION_MODEL : process.env.LINGYA_TEXT_MODEL) || LINGYA_DEFAULT_MODEL,
  };
  return {
    provider: "xiaomi", apiKey: process.env.XIAOMI_MIMO_API_KEY || "", baseUrl: normalizeOpenAiCompatibleBaseUrl(process.env.XIAOMI_MIMO_BASE_URL || XIAOMI_DEFAULT_BASE_URL),
    model: (kind === "vision" ? process.env.XIAOMI_MIMO_VISION_MODEL : process.env.XIAOMI_MIMO_TEXT_MODEL) || process.env.XIAOMI_MIMO_MODEL || XIAOMI_DEFAULT_MODEL,
  };
}
