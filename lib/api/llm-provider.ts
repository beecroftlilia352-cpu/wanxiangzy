import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";

type LlmKind = "text" | "vision";
type LlmProvider = "xiaomi" | "yunwu" | "lingya";

interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const XIAOMI_DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
const XIAOMI_DEFAULT_MODEL = "mimo-v2.5-pro";
const YUNWU_DEFAULT_BASE_URL = "https://yunwu.ai";
const YUNWU_DEFAULT_MODEL = "gpt-5.4-nano";
const LINGYA_DEFAULT_MODEL = "gpt-4o-mini";

export function getLlmConfig(kind: LlmKind): LlmConfig {
  const provider = getLlmProvider();
  if (provider === "yunwu") return getYunwuConfig(kind);
  if (provider === "lingya") return getLingyaConfig(kind);
  return getXiaomiConfig(kind);
}

export function getLlmFallbackConfigs(kind: LlmKind): LlmConfig[] {
  const primary = getLlmConfig(kind);
  const fallback = primary.provider === "xiaomi" ? getYunwuConfig(kind) : getXiaomiConfig(kind);
  const configs = [primary, fallback].filter((config) => config.apiKey && config.baseUrl && config.model);
  const seen = new Set<string>();

  return configs.filter((config) => {
    const key = `${config.provider}:${config.baseUrl}:${config.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function getLlmProvider(): LlmProvider {
  const provider = process.env.ANALYZE_LLM_PROVIDER?.trim().toLowerCase();
  if (provider === "yunwu") return "yunwu";
  if (provider === "lingya") return "lingya";
  return "xiaomi";
}

export function getChatCompletionsUrl(config: LlmConfig): string {
  return `${config.baseUrl}/chat/completions`;
}

function getXiaomiConfig(kind: LlmKind): LlmConfig {
  const envBase = process.env.XIAOMI_MIMO_BASE_URL;
  return {
    provider: "xiaomi",
    apiKey: process.env.XIAOMI_MIMO_API_KEY || "",
    baseUrl: envBase ? normalizeOpenAiCompatibleBaseUrl(envBase) : XIAOMI_DEFAULT_BASE_URL,
    model:
      (kind === "vision"
        ? process.env.XIAOMI_MIMO_VISION_MODEL
        : process.env.XIAOMI_MIMO_TEXT_MODEL) ||
      process.env.XIAOMI_MIMO_MODEL ||
      XIAOMI_DEFAULT_MODEL,
  };
}

function getYunwuConfig(kind: LlmKind): LlmConfig {
  const envBase = process.env.YUNWU_API_BASE_URL || process.env.YUNWU_NATIVE_BASE_URL;
  return {
    provider: "yunwu",
    apiKey: process.env.YUNWU_API_KEY || process.env.YUNWU_NATIVE_API_KEY || "",
    baseUrl: normalizeOpenAiCompatibleBaseUrl(envBase || YUNWU_DEFAULT_BASE_URL),
    model:
      (kind === "vision"
        ? process.env.YUNWU_VISION_MODEL || process.env.LINGYA_VISION_MODEL
        : process.env.YUNWU_TEXT_MODEL || process.env.LINGYA_TEXT_MODEL) ||
      YUNWU_DEFAULT_MODEL,
  };
}

function getLingyaConfig(kind: LlmKind): LlmConfig {
  const envBase = process.env.LINGYA_BASE_URL;
  return {
    provider: "lingya",
    apiKey: process.env.LINGYA_API_KEY || "",
    baseUrl: envBase ? normalizeOpenAiCompatibleBaseUrl(envBase) : "",
    model:
      (kind === "vision"
        ? process.env.LINGYA_VISION_MODEL
        : process.env.LINGYA_TEXT_MODEL) || LINGYA_DEFAULT_MODEL,
  };
}
