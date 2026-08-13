import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";
import {
  normalizeGptImageProvider,
  normalizeNanoBananaProvider,
} from "@/lib/api/model-routing-config";
import type { PricedImageModel } from "@/lib/model-pricing";

export const MODEL_PROVIDERS_CONFIG_KEY = "model.providers";

export type ImageProviderResponseType = "openai-image" | "gemini-native";

export type ModelProviderOverride = {
  enabled: boolean;
  baseUrl: string;
  apiKey?: string;
  upstreamModel: string;
  responseType: ImageProviderResponseType;
};

export const DEFAULT_GPT_IMAGE_2_MODEL = "gpt-image-2";
export const DEFAULT_NANO_BANANA_MODEL = "gemini-3.1-flash-image";
export const DEFAULT_NANO_BANANA_PRO_MODEL = "gemini-3-pro-image";

const DEFAULT_CATROUTER_BASE_URL = "https://api.catrouter.net";
const DEFAULT_PLATO_BASE_URL = "https://yunwu.ai/v1";
const DEFAULT_YUNWU_NATIVE_BASE_URL = "https://yunwu.ai";
const DEFAULT_LAOZHANG_BASE_URL = "https://api.laozhang.ai";

export const IMAGE_RESPONSE_TYPES: ReadonlyArray<ImageProviderResponseType> = [
  "openai-image",
  "gemini-native",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeImageProviderResponseType(value: unknown): ImageProviderResponseType | null {
  return value === "openai-image" || value === "gemini-native" ? value : null;
}

function normalizeNativeApiBaseUrl(value: string | undefined, fallback: string): string {
  const raw = (value || fallback).trim().replace(/\/+$/, "");
  return raw.replace(/\/v1beta$/i, "").replace(/\/v1$/i, "");
}

export function normalizeProviderBaseUrl(
  value: string | undefined,
  responseType: ImageProviderResponseType,
  fallback: string,
): string {
  if (responseType === "gemini-native") return normalizeNativeApiBaseUrl(value, fallback);
  const normalized = value ? normalizeOpenAiCompatibleBaseUrl(value) : normalizeOpenAiCompatibleBaseUrl(fallback);
  return normalized || normalizeOpenAiCompatibleBaseUrl(fallback);
}

export function getEnvModelProviderOverride(model: PricedImageModel): ModelProviderOverride {
  if (model === "gpt-image-2") {
    const provider = normalizeGptImageProvider(process.env.GPT_IMAGE_PROVIDER);
    if (provider === "catrouter") {
      return {
        enabled: true,
        baseUrl: normalizeProviderBaseUrl(process.env.CATROUTER_BASE_URL, "openai-image", DEFAULT_CATROUTER_BASE_URL),
        apiKey: process.env.CATROUTER_API_KEY?.trim(),
        upstreamModel: process.env.CATROUTER_GPT_IMAGE_MODEL?.trim() || DEFAULT_GPT_IMAGE_2_MODEL,
        responseType: "openai-image",
      };
    }
    return {
      enabled: true,
      baseUrl: normalizeProviderBaseUrl(process.env.PLATO_BASE_URL, "openai-image", DEFAULT_PLATO_BASE_URL),
      apiKey: process.env.PLATO_API_KEY?.trim() || process.env.LINGYA_API_KEY?.trim(),
      upstreamModel: process.env.PLATO_GPT_IMAGE_MODEL?.trim() || DEFAULT_GPT_IMAGE_2_MODEL,
      responseType: "openai-image",
    };
  }

  const provider = normalizeNanoBananaProvider(process.env.NANO_BANANA_PROVIDER);
  const pro = model === "nano-banana-pro";

  if (provider === "catrouter") {
    return {
      enabled: true,
      baseUrl: normalizeProviderBaseUrl(process.env.CATROUTER_BASE_URL, "gemini-native", DEFAULT_CATROUTER_BASE_URL),
      apiKey: process.env.CATROUTER_API_KEY?.trim(),
      upstreamModel: pro
        ? process.env.CATROUTER_NANO_BANANA_PRO_MODEL?.trim() || DEFAULT_NANO_BANANA_PRO_MODEL
        : process.env.CATROUTER_NANO_BANANA_MODEL?.trim() || DEFAULT_NANO_BANANA_MODEL,
      responseType: "gemini-native",
    };
  }

  if (provider === "laozhang") {
    return {
      enabled: true,
      baseUrl: normalizeProviderBaseUrl(process.env.LAOZHANG_BASE_URL, "gemini-native", DEFAULT_LAOZHANG_BASE_URL),
      apiKey: process.env.LAOZHANG_API_KEY?.trim(),
      upstreamModel: pro
        ? process.env.LAOZHANG_NANO_BANANA_PRO_MODEL?.trim() || DEFAULT_NANO_BANANA_PRO_MODEL
        : process.env.LAOZHANG_NANO_BANANA_MODEL?.trim() || DEFAULT_NANO_BANANA_MODEL,
      responseType: "gemini-native",
    };
  }

  return {
    enabled: true,
    baseUrl: normalizeProviderBaseUrl(
      process.env.YUNWU_NATIVE_BASE_URL || process.env.YUNWU_API_BASE_URL,
      "gemini-native",
      DEFAULT_YUNWU_NATIVE_BASE_URL,
    ),
    apiKey: process.env.YUNWU_NATIVE_API_KEY?.trim() || process.env.YUNWU_API_KEY?.trim(),
    upstreamModel: pro
      ? process.env.YUNWU_NANO_BANANA_PRO_MODEL?.trim() || DEFAULT_NANO_BANANA_PRO_MODEL
      : process.env.YUNWU_NANO_BANANA_MODEL?.trim() || DEFAULT_NANO_BANANA_MODEL,
    responseType: "gemini-native",
  };
}

export function parseModelProviderOverrides(
  value: unknown,
): Partial<Record<PricedImageModel, ModelProviderOverride>> {
  if (!isRecord(value)) return {};
  const container = isRecord(value.models) ? value.models : value;

  const out: Partial<Record<PricedImageModel, ModelProviderOverride>> = {};
  for (const model of ["gpt-image-2", "nano-banana-2", "nano-banana-pro"] as const) {
    const raw = container[model];
    if (!isRecord(raw)) continue;

    const fallback = getEnvModelProviderOverride(model);
    const responseType = normalizeImageProviderResponseType(raw.responseType) || fallback.responseType;
    const baseUrl =
      typeof raw.baseUrl === "string" && raw.baseUrl.trim()
        ? raw.baseUrl.trim()
        : fallback.baseUrl;

    out[model] = {
      enabled: raw.enabled !== false,
      baseUrl,
      apiKey: typeof raw.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : fallback.apiKey,
      upstreamModel:
        typeof raw.upstreamModel === "string" && raw.upstreamModel.trim()
          ? raw.upstreamModel.trim()
          : fallback.upstreamModel,
      responseType,
    };
  }
  return out;
}
