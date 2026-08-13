import { supportsVideoMotionControl, type VideoProviderName } from "@/lib/api/video-catalog";
import { generateNewApiFirstLastFrame, generateNewApiImageToVideo } from "@/lib/api/newapi-video";
import { getEnvVideoProviderOverrides } from "@/lib/api/video-provider-registry";
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
};

export async function getVideoProviderConfig(provider: VideoProviderName): Promise<VideoProviderConfig> {
  if (process.env.NODE_ENV === "test") {
    const env = getEnvVideoProviderOverrides()[provider];
    if (!env?.apiKey?.trim()) {
      throw new Error(`视频供应商 ${provider} API Key 未配置（test env fallback）`);
    }
    return { provider, apiKey: env.apiKey.trim(), baseUrl: env.baseUrl };
  }

  const { getAdminVideoProviderOverrides } = await import("@/lib/api/video-provider-registry.server");
  const overrides = await getAdminVideoProviderOverrides();
  const override = overrides[provider];
  if (!override || override.enabled === false || !override.apiKey?.trim()) {
    throw new Error(`视频供应商 ${provider} 未在后台启用，请先到 /admin/providers 完成 video.providers 配置`);
  }
  return { provider, apiKey: override.apiKey.trim(), baseUrl: override.baseUrl };
}

export async function getEnabledVideoProviders(): Promise<VideoProviderName[]> {
  if (process.env.NODE_ENV === "test") {
    const env = getEnvVideoProviderOverrides();
    return (Object.keys(env) as VideoProviderName[]).filter((provider) => Boolean(env[provider]?.enabled && env[provider]?.apiKey?.trim()));
  }

  const { getEnabledVideoProviderOverrides } = await import("@/lib/api/video-provider-registry.server");
  const overrides = await getEnabledVideoProviderOverrides();
  return overrides.map((item) => item.provider);
}

function toNewApiProvider(config: VideoProviderConfig): NewApiVideoProviderConfig {
  return { provider: config.provider, apiBase: config.baseUrl, apiKey: config.apiKey };
}

export async function generateVideoImageToVideo(input: VideoImageToVideoInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig(input.provider);
  return generateNewApiImageToVideo(input, toNewApiProvider(config));
}

export async function generateVideoMotionControl(input: VideoMotionControlInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig(input.provider);
  if (!supportsVideoMotionControl(config.provider)) {
    throw new Error("当前视频供应商暂不支持参考视频动作模仿，请使用图生视频或首尾帧功能。");
  }
  throw new Error("当前视频供应商暂不支持参考视频动作模仿。");
}

export async function generateVideoFirstLastFrame(input: VideoFirstLastFrameInput): Promise<VideoGenerationResult> {
  const config = await getVideoProviderConfig(input.provider);
  return generateNewApiFirstLastFrame(input, toNewApiProvider(config));
}
