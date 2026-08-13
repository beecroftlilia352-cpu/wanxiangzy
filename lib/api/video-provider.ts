import type { VideoProviderName } from "@/lib/api/video-provider-registry";
import type {
  HappyHorseFirstLastFrameInput,
  HappyHorseImageToVideoInput,
  HappyHorseMotionControlInput,
  VideoGenerationResult,
} from "@/lib/api/happyhorse-video";
import {
  generateHappyHorseFirstLastFrame,
  generateHappyHorseImageToVideo,
  generateHappyHorseMotionControl,
  type ProviderConfig as HappyHorseProviderConfig,
} from "@/lib/api/happyhorse-video";
import {
  generateMinimaxFirstLastFrame,
  generateMinimaxImageToVideo,
  generateMinimaxMotionControl,
  type MiniMaxVideoProviderConfig,
} from "@/lib/api/minimax-video";
import { getEnvVideoProviderOverride } from "@/lib/api/video-provider-registry";

export type VideoProviderConfig = {
  provider: VideoProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export async function getVideoProviderConfig(): Promise<VideoProviderConfig> {
  if (process.env.NODE_ENV === "test") {
    const env = getEnvVideoProviderOverride();
    if (!env.enabled || !env.apiKey?.trim()) {
      throw new Error("视频供应商 API Key 未配置（test env fallback）");
    }
    return { provider: env.provider, apiKey: env.apiKey.trim(), baseUrl: env.baseUrl, model: env.upstreamModel };
  }

  const { getAdminVideoProviderOverride } = await import("@/lib/api/video-provider-registry.server");
  const override = await getAdminVideoProviderOverride();
  if (!override || override.enabled === false) {
    throw new Error("视频供应商未在后台配置，请先到 /admin/providers 完成 video.providers 配置");
  }
  const apiKey = override.apiKey?.trim();
  if (!apiKey) {
    throw new Error("视频供应商 API Key 未在后台配置，请先到 /admin/providers 完成 video.providers 配置");
  }
  return {
    provider: override.provider,
    apiKey,
    baseUrl: override.baseUrl,
    model: override.upstreamModel,
  };
}

function toHappyHorseProvider(config: VideoProviderConfig): HappyHorseProviderConfig {
  return { apiBase: config.baseUrl, apiKey: config.apiKey };
}

function toMiniMaxProvider(config: VideoProviderConfig): MiniMaxVideoProviderConfig {
  return { apiBase: config.baseUrl, apiKey: config.apiKey, model: config.model };
}

export async function generateVideoImageToVideo(input: HappyHorseImageToVideoInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig();
  if (config.provider === "happyhorse") {
    return generateHappyHorseImageToVideo(input, toHappyHorseProvider(config));
  }
  return generateMinimaxImageToVideo(input, toMiniMaxProvider(config));
}

export async function generateVideoMotionControl(input: HappyHorseMotionControlInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig();
  if (config.provider === "happyhorse") {
    return generateHappyHorseMotionControl(input, toHappyHorseProvider(config));
  }
  return generateMinimaxMotionControl(input, toMiniMaxProvider(config));
}

export async function generateVideoFirstLastFrame(input: HappyHorseFirstLastFrameInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig();
  if (config.provider === "happyhorse") {
    return generateHappyHorseFirstLastFrame(input, toHappyHorseProvider(config));
  }
  return generateMinimaxFirstLastFrame(input, toMiniMaxProvider(config));
}
