import type { LingyaModel } from "@/lib/api/lingya";

export const MODEL_ROUTING_CONFIG_KEY = "model.routing";

export type GptImageProviderName = "catrouter" | "plato";
export type NanoBananaProviderName = "yunwu" | "laozhang" | "catrouter";
export type ModelRoutingSource = "admin" | "env";

export type ModelRoutingConfig = {
  source: ModelRoutingSource;
  configKey: typeof MODEL_ROUTING_CONFIG_KEY;
  versionId?: string;
  publishedAt?: string | null;
  gptImageProvider: GptImageProviderName;
  nanoBananaProvider: NanoBananaProviderName;
  rawValue?: Record<string, unknown>;
};

export function normalizeGptImageProvider(value: unknown, fallback: GptImageProviderName = "catrouter"): GptImageProviderName {
  const normalized = normalizeProviderToken(value);
  if (normalized === "catrouter" || normalized === "cat-router" || normalized === "cat_router") return "catrouter";
  if (normalized === "plato" || normalized === "yunwu" || normalized === "yunwu-openai") return "plato";
  return fallback;
}

export function normalizeNanoBananaProvider(value: unknown, fallback: NanoBananaProviderName = "yunwu"): NanoBananaProviderName {
  const normalized = normalizeProviderToken(value);
  if (normalized === "catrouter" || normalized === "cat-router" || normalized === "cat_router") return "catrouter";
  if (normalized === "laozhang" || normalized === "lao-zhang" || normalized === "lao_zhang") return "laozhang";
  if (normalized === "yunwu" || normalized === "yunwu-native") return "yunwu";
  return fallback;
}

export function getEnvModelRoutingConfig(): ModelRoutingConfig {
  return {
    source: "env",
    configKey: MODEL_ROUTING_CONFIG_KEY,
    gptImageProvider: normalizeGptImageProvider(process.env.GPT_IMAGE_PROVIDER),
    nanoBananaProvider: normalizeNanoBananaProvider(process.env.NANO_BANANA_PROVIDER),
  };
}

export function parseModelRoutingConfig(
  value: Record<string, unknown>,
  options: {
    source?: ModelRoutingSource;
    versionId?: string;
    publishedAt?: string | null;
    fallback?: ModelRoutingConfig;
  } = {},
): ModelRoutingConfig {
  const fallback = options.fallback || getEnvModelRoutingConfig();
  const gptProviderValue =
    value.gptImageProvider ??
    value.gptProvider ??
    getConfiguredModelProvider(value, "gpt-image-2");
  const bananaProviderValue =
    value.nanoBananaProvider ??
    value.bananaProvider ??
    getConfiguredModelProvider(value, "nano-banana-2") ??
    getConfiguredModelProvider(value, "nano-banana-pro");

  return {
    source: options.source || "admin",
    configKey: MODEL_ROUTING_CONFIG_KEY,
    versionId: options.versionId,
    publishedAt: options.publishedAt,
    gptImageProvider: normalizeGptImageProvider(gptProviderValue, fallback.gptImageProvider),
    nanoBananaProvider: normalizeNanoBananaProvider(bananaProviderValue, fallback.nanoBananaProvider),
    rawValue: value,
  };
}

export function getProviderForModel(config: ModelRoutingConfig, model: LingyaModel): GptImageProviderName | NanoBananaProviderName {
  return model === "gpt-image-2" ? config.gptImageProvider : config.nanoBananaProvider;
}

function getConfiguredModelProvider(value: Record<string, unknown>, model: LingyaModel): unknown {
  if (!isRecord(value.models)) return undefined;
  const modelConfig = value.models[model];
  return isRecord(modelConfig) ? modelConfig.provider : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProviderToken(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}
