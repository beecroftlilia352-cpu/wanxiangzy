import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";

export const VIDEO_PROVIDERS_CONFIG_KEY = "video.providers";

export type VideoProviderName = "minimax" | "happyhorse";
export type VideoProviderResponseType = "minimax-video" | "happyhorse-video";

export type VideoProviderOverride = {
  enabled: boolean;
  provider: VideoProviderName;
  baseUrl: string;
  apiKey?: string;
  upstreamModel: string;
  responseType: VideoProviderResponseType;
};

export const DEFAULT_MINIMAX_VIDEO_MODEL = "minimax-h3";
export const DEFAULT_HAPPYHORSE_VIDEO_MODEL = "happyhorse-1.0-i2v";

export const DEFAULT_MINIMAX_VIDEO_BASE_URL = "https://api.new.bi";
export const DEFAULT_HAPPYHORSE_VIDEO_BASE_URL = "https://yunwu.ai";

export const VIDEO_RESPONSE_TYPES: ReadonlyArray<VideoProviderResponseType> = [
  "minimax-video",
  "happyhorse-video",
];

export const VIDEO_PROVIDER_NAMES: ReadonlyArray<VideoProviderName> = [
  "minimax",
  "happyhorse",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeVideoProviderName(value: unknown): VideoProviderName {
  const token = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (token === "minimax" || token === "hailuo" || token === "minimax-h3") return "minimax";
  if (token === "happyhorse" || token === "yunwu" || token === "alibailian") return "happyhorse";
  return "minimax";
}

export function normalizeVideoProviderResponseType(value: unknown): VideoProviderResponseType | null {
  if (value === "minimax-video" || value === "happyhorse-video") return value;
  return null;
}

function defaultResponseType(provider: VideoProviderName): VideoProviderResponseType {
  return provider === "minimax" ? "minimax-video" : "happyhorse-video";
}

function defaultBaseUrl(provider: VideoProviderName): string {
  return provider === "minimax" ? DEFAULT_MINIMAX_VIDEO_BASE_URL : DEFAULT_HAPPYHORSE_VIDEO_BASE_URL;
}

export function normalizeVideoProviderBaseUrl(value: string | undefined, provider: VideoProviderName): string {
  const fallback = defaultBaseUrl(provider);
  if (provider === "minimax") {
    const base = (value || fallback).trim().replace(/\/+$/, "");
    return base.replace(/\/v2$/i, "") || fallback;
  }
  return normalizeOpenAiCompatibleBaseUrl(value || fallback);
}

export function getEnvVideoProviderOverride(): VideoProviderOverride {
  const provider = normalizeVideoProviderName(
    process.env.VIDEO_PROVIDER || process.env.HAPPYHORSE_VIDEO_PROVIDER || "minimax",
  );
  if (provider === "happyhorse") {
    return {
      enabled: true,
      provider: "happyhorse",
      baseUrl: normalizeVideoProviderBaseUrl(
        process.env.HAPPYHORSE_BASE_URL || process.env.YUNWU_HAPPYHORSE_BASE_URL || process.env.YUNWU_API_BASE_URL,
        "happyhorse",
      ),
      apiKey: process.env.HAPPYHORSE_API_KEY?.trim() || process.env.YUNWU_HAPPYHORSE_API_KEY?.trim() || process.env.YUNWU_API_KEY?.trim(),
      upstreamModel: process.env.HAPPYHORSE_VIDEO_MODEL?.trim() || DEFAULT_HAPPYHORSE_VIDEO_MODEL,
      responseType: "happyhorse-video",
    };
  }

  return {
    enabled: true,
    provider: "minimax",
    baseUrl: normalizeVideoProviderBaseUrl(
      process.env.MINIMAX_VIDEO_BASE_URL || process.env.MINIMAX_BASE_URL,
      "minimax",
    ),
    apiKey: process.env.MINIMAX_VIDEO_API_KEY?.trim() || process.env.MINIMAX_API_KEY?.trim(),
    upstreamModel: process.env.MINIMAX_VIDEO_MODEL?.trim() || DEFAULT_MINIMAX_VIDEO_MODEL,
    responseType: "minimax-video",
  };
}

export function parseVideoProviderOverride(value: unknown): VideoProviderOverride | null {
  if (!isRecord(value)) return null;
  const container = isRecord(value.models) ? value.models : value;
  const raw = isRecord(container.video) ? container.video : container;

  const fallback = getEnvVideoProviderOverride();
  const provider = normalizeVideoProviderName(raw.provider ?? fallback.provider);
  const responseType = normalizeVideoProviderResponseType(raw.responseType) ?? defaultResponseType(provider);
  const baseUrl =
    typeof raw.baseUrl === "string" && raw.baseUrl.trim()
      ? normalizeVideoProviderBaseUrl(raw.baseUrl, provider)
      : fallback.baseUrl;

  return {
    enabled: raw.enabled !== false,
    provider,
    baseUrl,
    apiKey: typeof raw.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : fallback.apiKey,
    upstreamModel:
      typeof raw.upstreamModel === "string" && raw.upstreamModel.trim()
        ? raw.upstreamModel.trim()
        : fallback.upstreamModel,
    responseType,
  };
}
