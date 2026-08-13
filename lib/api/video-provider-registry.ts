import { getVideoProviderBaseUrl, type VideoProviderName } from "@/lib/api/video-catalog";

export const VIDEO_PROVIDERS_CONFIG_KEY = "video.providers";

export type VideoProviderResponseType = "newapi-video";

export type VideoProviderOverride = {
  enabled: boolean;
  provider: VideoProviderName;
  baseUrl: string;
  apiKey?: string;
  upstreamModel: string;
  responseType: VideoProviderResponseType;
};

export const DEFAULT_VIDEO_BASE_URL = "https://api.new.bi";

export const VIDEO_RESPONSE_TYPES: ReadonlyArray<VideoProviderResponseType> = ["newapi-video"];

export const VIDEO_PROVIDER_NAMES: ReadonlyArray<VideoProviderName> = ["minimax", "seedance"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeVideoProviderName(value: unknown): VideoProviderName {
  const token = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (token === "seedance" || token === "doubao" || token === "doubao-seedance") return "seedance";
  if (token === "minimax" || token === "hailuo" || token === "minimax-h3" || token === "") return "minimax";
  return "minimax";
}

export function normalizeVideoProviderResponseType(value: unknown): VideoProviderResponseType | null {
  if (value === "newapi-video" || value === "minimax-video" || value === "seedance-video" || value === "happyhorse-video") {
    return "newapi-video";
  }
  return null;
}

export function normalizeVideoProviderBaseUrl(value: string | undefined, provider: VideoProviderName): string {
  const fallback = getVideoProviderBaseUrl(provider);
  const base = (value || fallback).trim().replace(/\/+$/, "");
  return base.replace(/\/v2$/i, "") || fallback;
}

export function getEnvVideoProviderOverride(): VideoProviderOverride {
  const provider = normalizeVideoProviderName(process.env.VIDEO_PROVIDER);
  return {
    enabled: true,
    provider,
    baseUrl: normalizeVideoProviderBaseUrl(
      process.env.VIDEO_BASE_URL || process.env.MINIMAX_VIDEO_BASE_URL || process.env.MINIMAX_BASE_URL,
      provider,
    ),
    apiKey: process.env.VIDEO_API_KEY?.trim() || process.env.MINIMAX_VIDEO_API_KEY?.trim() || process.env.MINIMAX_API_KEY?.trim(),
    upstreamModel: "",
    responseType: "newapi-video",
  };
}

export function parseVideoProviderOverride(value: unknown): VideoProviderOverride | null {
  if (!isRecord(value)) return null;
  const container = isRecord(value.models) ? value.models : value;
  const raw = isRecord(container.video) ? container.video : container;

  const fallback = getEnvVideoProviderOverride();
  const provider = normalizeVideoProviderName(raw.provider ?? fallback.provider);
  const responseType = normalizeVideoProviderResponseType(raw.responseType) ?? "newapi-video";
  const baseUrl =
    typeof raw.baseUrl === "string" && raw.baseUrl.trim()
      ? normalizeVideoProviderBaseUrl(raw.baseUrl, provider)
      : fallback.baseUrl;

  return {
    enabled: raw.enabled !== false,
    provider,
    baseUrl,
    apiKey: typeof raw.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : fallback.apiKey,
    upstreamModel: typeof raw.upstreamModel === "string" ? raw.upstreamModel.trim() : "",
    responseType,
  };
}
