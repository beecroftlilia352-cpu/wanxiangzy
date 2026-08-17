import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";
import { buildAiAdapterAuthHeaders, mergeAiAdapterParameters, resolveAiAdapterUrl } from "@/lib/ai-control-plane/adapters";
import type {
  LlmKind,
  LlmProviderName,
} from "@/lib/api/llm-provider-registry";

export type LlmProvider = string;

export type LlmConfig = {
  provider: LlmProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
};

const MINIMAX_DEFAULT_BASE_URL = "https://api.minimaxi.com";
const MINIMAX_DEFAULT_MODEL = "MiniMax-M3";
const XIAOMI_DEFAULT_BASE_URL = "https://api.xiaomimimo.com/v1";
const XIAOMI_DEFAULT_MODEL = "mimo-v2.5-pro";
const YUNWU_DEFAULT_BASE_URL = "https://yunwu.ai";
const YUNWU_DEFAULT_MODEL = "gpt-5.4-nano";
const LINGYA_DEFAULT_MODEL = "gpt-4o-mini";

export async function getLlmConfig(kind: LlmKind): Promise<LlmConfig> {
  if (process.env.NODE_ENV === "test") {
    return getLegacyEnvLlmConfig(kind);
  }

  const unified = await getUnifiedLlmConfigs(kind);
  if (unified.length) return unified[0];
  const { getAdminLlmProviderOverride } = await import("@/lib/api/llm-provider-registry.server");
  const override = await getAdminLlmProviderOverride(kind);
  if (!override || override.enabled === false) {
    throw new Error(`LLM ${kind} provider is not configured in admin`);
  }
  const apiKey = override.apiKey?.trim();
  if (!apiKey) {
    throw new Error(`LLM ${kind} provider API key is not configured in admin`);
  }

  return {
    provider: override.provider,
    apiKey,
    baseUrl: normalizeOpenAiCompatibleBaseUrl(override.baseUrl),
    model: override.upstreamModel,
  };
}

export async function getLlmFallbackConfigs(kind: LlmKind): Promise<LlmConfig[]> {
  if (process.env.NODE_ENV === "test") {
    const primary = await getLlmConfig(kind);
    const fallbackProvider = primary.provider === "xiaomi" ? "yunwu" : "xiaomi";
    const fallback = getLegacyEnvLlmConfigForProvider(fallbackProvider, kind);
    return [primary, fallback].filter((config) => config.apiKey && config.baseUrl && config.model);
  }
  const unified = await getUnifiedLlmConfigs(kind);
  if (unified.length) return unified;
  const primary = await getLlmConfig(kind);
  return [primary].filter((config) => config.apiKey && config.baseUrl && config.model);
}

export function getChatCompletionsUrl(config: LlmConfig): string {
  return `${config.baseUrl}/chat/completions`;
}

/**
 * Execute one OpenAI-compatible chat request through the shared router.
 * The caller keeps receiving a standard Response, while the router owns the
 * upstream model override, capacity lease, failover and attempt telemetry.
 */
export async function fetchLlmChat(
  kind: LlmKind,
  init: RequestInit,
  context?: { userId?: string; requestId?: string },
): Promise<Response> {
  if (process.env.NODE_ENV === "test") {
    const config = await getLlmConfig(kind);
    return fetch(getChatCompletionsUrl(config), withLlmConfig(init, config));
  }
  const [{ executeAiRouted, AiProviderHttpError }, { getAiRouteContext }] = await Promise.all([
    import("@/lib/ai-control-plane/router.server"),
    import("@/lib/ai-control-plane/context.server"),
  ]);
  const { getDefaultAiModelId } = await import("@/lib/ai-control-plane/server");
  const ambient = getAiRouteContext();
  const modelId = await getDefaultAiModelId(kind);
  const result = await executeAiRouted({
    modelId,
    modality: kind,
    context: { ...ambient, ...context },
    execute: async (deployment) => {
      if (deployment.protocol !== "openai-chat") {
        throw new Error(`LLM 部署 ${deployment.id} 的协议 ${deployment.protocol} 不受支持`);
      }
      const url = resolveAiAdapterUrl({
        baseUrl: normalizeOpenAiCompatibleBaseUrl(deployment.provider.baseUrl),
        protocol: "openai-chat",
        operation: "generation",
        adapterConfig: deployment.adapterConfig,
      });
      const requestInit = withLlmConfig(withStaticParameters(init, deployment.adapterConfig?.staticParameters), {
        provider: deployment.providerId,
        apiKey: deployment.apiKey,
        baseUrl: deployment.provider.baseUrl,
        model: deployment.upstreamModel,
      }, deployment.adapterConfig?.authMode);
      const response = await fetch(url, { ...requestInit, signal: deployment.abortSignal || requestInit.signal });
      const responseText = await response.text();
      if (!response.ok) {
        throw new AiProviderHttpError(`LLM API 错误 ${response.status}: ${responseText.slice(0, 300)}`, {
          status: response.status,
          retryAfterSeconds: parseRetryAfter(response.headers.get("retry-after")),
        });
      }
      const usage = readUsage(responseText);
      return {
        response: new Response(responseText, { status: response.status, statusText: response.statusText, headers: response.headers }),
        usage,
      };
    },
    describeResult: (value) => ({ inputUnits: value.usage.input, outputUnits: value.usage.output }),
  });
  return result.response;
}

async function getUnifiedLlmConfigs(kind: LlmKind): Promise<LlmConfig[]> {
  try {
    const { getAiControlPlaneConfig } = await import("@/lib/ai-control-plane/server");
    const config = await getAiControlPlaneConfig({ decryptSecrets: true, allowLegacy: true });
    if (!config) return [];
    const modelId = config.models.find((item) => item.id === `${kind}-default` && item.enabled)?.id
      || config.models.find((item) => item.modality === kind && item.enabled)?.id;
    if (!modelId) return [];
    const providers = new Map(config.providers.filter((item) => item.enabled && item.apiKey).map((item) => [item.id, item]));
    return config.deployments
      .filter((item) => item.enabled && item.modelId === modelId && item.protocol === "openai-chat" && providers.has(item.providerId))
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight)
      .map((item) => {
        const provider = providers.get(item.providerId)!;
        return { provider: provider.id, apiKey: provider.apiKey || "", baseUrl: normalizeOpenAiCompatibleBaseUrl(provider.baseUrl), model: item.upstreamModel };
      });
  } catch {
    return [];
  }
}

function withLlmConfig(init: RequestInit, config: LlmConfig, authMode?: "bearer" | "x-api-key" | "x-goog-api-key"): RequestInit {
  const headers = new Headers(init.headers);
  headers.delete("Authorization");
  headers.delete("x-api-key");
  headers.delete("x-goog-api-key");
  for (const [key, value] of Object.entries(buildAiAdapterAuthHeaders({ protocol: "openai-chat", apiKey: config.apiKey, adapterConfig: { authMode } }))) headers.set(key, value);
  headers.set("Content-Type", "application/json");
  let body = init.body;
  if (typeof body === "string") {
    try { body = JSON.stringify({ ...JSON.parse(body), model: config.model }); } catch { /* keep original body */ }
  }
  return { ...init, headers, body };
}

function withStaticParameters(init: RequestInit, staticParameters?: Record<string, string | number | boolean>): RequestInit {
  if (!staticParameters || typeof init.body !== "string") return init;
  try {
    const canonical = JSON.parse(init.body) as Record<string, unknown>;
    return { ...init, body: JSON.stringify(mergeAiAdapterParameters(canonical, { staticParameters })) };
  } catch {
    return init;
  }
}

function readUsage(value: string) {
  try {
    const data = JSON.parse(value) as { usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number } };
    return { input: data.usage?.prompt_tokens ?? data.usage?.input_tokens, output: data.usage?.completion_tokens ?? data.usage?.output_tokens };
  } catch { return {}; }
}
function parseRetryAfter(value: string | null) { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 3600) : undefined; }

function getLegacyEnvLlmConfig(kind: LlmKind): LlmConfig {
  const provider = (process.env.ANALYZE_LLM_PROVIDER || "xiaomi").trim().toLowerCase();
  if (provider === "minimax") return getLegacyEnvLlmConfigForProvider("minimax", kind);
  if (provider === "yunwu") return getLegacyEnvLlmConfigForProvider("yunwu", kind);
  if (provider === "lingya") return getLegacyEnvLlmConfigForProvider("lingya", kind);
  return getLegacyEnvLlmConfigForProvider("xiaomi", kind);
}

function getLegacyEnvLlmConfigForProvider(provider: LlmProviderName, kind: LlmKind): LlmConfig {
  if (provider === "minimax") {
    return {
      provider: "minimax",
      apiKey: process.env.MINIMAX_API_KEY || "",
      baseUrl: normalizeOpenAiCompatibleBaseUrl(process.env.MINIMAX_BASE_URL || MINIMAX_DEFAULT_BASE_URL),
      model:
        (kind === "vision" ? process.env.MINIMAX_VISION_MODEL : process.env.MINIMAX_TEXT_MODEL) ||
        process.env.MINIMAX_MODEL ||
        MINIMAX_DEFAULT_MODEL,
    };
  }
  if (provider === "yunwu") {
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
  if (provider === "lingya") {
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
