import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";

type LlmKind = "text" | "vision";
type LlmProvider = "xiaomi" | "lingya";

interface LlmConfig {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const XIAOMI_DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
const XIAOMI_DEFAULT_MODEL = "mimo-v2.5-pro";
const LINGYA_DEFAULT_MODEL = "gpt-4o-mini";

export function getLlmConfig(kind: LlmKind): LlmConfig {
  const provider = getLlmProvider();
  return provider === "lingya" ? getLingyaConfig(kind) : getXiaomiConfig(kind);
}

export function getLlmProvider(): LlmProvider {
  return process.env.ANALYZE_LLM_PROVIDER?.toLowerCase() === "lingya"
    ? "lingya"
    : "xiaomi";
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
