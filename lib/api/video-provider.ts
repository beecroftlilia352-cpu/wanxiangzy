import {
  supportsVideoMotionControl,
  type VideoProviderName,
} from "@/lib/api/video-catalog";
import {
  generateNewApiFirstLastFrame,
  generateNewApiImageToVideo,
} from "@/lib/api/newapi-video";
import { getEnvVideoProviderOverride } from "@/lib/api/video-provider-registry";
import type {
  NewApiVideoProviderConfig,
  VideoFirstLastFrameInput,
  VideoGenerationResult,
  VideoImageToVideoInput,
  VideoMotionControlInput,
} from "@/lib/api/video-types";

export type VideoProviderConfig = {
  provider: VideoProviderName;
  apiKey: string;
  baseUrl: string;
  model: string;
};

export async function getVideoProviderConfig(): Promise<VideoProviderConfig> {
  if (process.env.NODE_ENV === "test") {
    const env = getEnvVideoProviderOverride();
    if (!env.apiKey?.trim()) {
      throw new Error("视频供应商 API Key 未配置（test env fallback）");
    }
    return { provider: env.provider, apiKey: env.apiKey.trim(), baseUrl: env.baseUrl, model: "" };
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

function toNewApiProvider(config: VideoProviderConfig): NewApiVideoProviderConfig {
  return { provider: config.provider, apiBase: config.baseUrl, apiKey: config.apiKey };
}

export async function generateVideoImageToVideo(input: VideoImageToVideoInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig();
  return generateNewApiImageToVideo(input, toNewApiProvider(config));
}

export async function generateVideoMotionControl(input: VideoMotionControlInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig();
  if (!supportsVideoMotionControl(config.provider)) {
    throw new Error("当前视频供应商暂不支持参考视频动作模仿，请使用图生视频或首尾帧功能。");
  }
  // Kept as a backstop; reference-video generation is currently unavailable
  // through the new.bi gateway for all supported providers.
  throw new Error("当前视频供应商暂不支持参考视频动作模仿。");
}

export async function generateVideoFirstLastFrame(input: VideoFirstLastFrameInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig();
  return generateNewApiFirstLastFrame(input, toNewApiProvider(config));
}
