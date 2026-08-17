import { supportsVideoMotionControl, type VideoProviderName } from "@/lib/api/video-catalog";
import { generateNewApiFirstLastFrame, generateNewApiImageToVideo, generateNewApiMotionControl } from "@/lib/api/newapi-video";
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

  const unified = await getUnifiedVideoConfigs(provider);
  if (unified.length) return unified[0];
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

  const { getAiControlPlaneConfig } = await import("@/lib/ai-control-plane/server");
  const config = await getAiControlPlaneConfig({ decryptSecrets: true, allowLegacy: true });
  if (config) {
    const enabled = (["minimax", "seedance"] as const).filter((provider) => {
      const modelId = `video-${provider}`;
      return config.models.some((model) => model.id === modelId && model.enabled)
        && config.deployments.some((item) => item.modelId === modelId && item.enabled && config.providers.some((endpoint) => endpoint.id === item.providerId && endpoint.enabled && endpoint.apiKey));
    });
    if (enabled.length) return enabled;
  }
  const { getEnabledVideoProviderOverrides } = await import("@/lib/api/video-provider-registry.server");
  const overrides = await getEnabledVideoProviderOverrides();
  return overrides.map((item) => item.provider);
}

function toNewApiProvider(config: VideoProviderConfig): NewApiVideoProviderConfig {
  return { provider: config.provider, apiBase: config.baseUrl, apiKey: config.apiKey };
}

export async function generateVideoImageToVideo(input: VideoImageToVideoInput): Promise<VideoGenerationResult> {
  return executeVideoRouted(input.provider, (config) => generateNewApiImageToVideo(input, config));
}

export async function generateVideoMotionControl(input: VideoMotionControlInput): Promise<VideoGenerationResult> {
  if (!supportsVideoMotionControl(input.provider)) {
    throw new Error("当前视频供应商暂不支持参考视频动作模仿，请使用图生视频或首尾帧功能。");
  }
  return executeVideoRouted(input.provider, (config) => generateNewApiMotionControl(input, config));
}

export async function generateVideoFirstLastFrame(input: VideoFirstLastFrameInput): Promise<VideoGenerationResult> {
  return executeVideoRouted(input.provider, (config) => generateNewApiFirstLastFrame(input, config));
}

async function executeVideoRouted(
  provider: VideoProviderName,
  execute: (config: NewApiVideoProviderConfig) => Promise<VideoGenerationResult>,
) {
  if (process.env.NODE_ENV === "test") {
    const config = await getVideoProviderConfig(provider);
    return execute(toNewApiProvider(config));
  }
  const { executeAiRouted } = await import("@/lib/ai-control-plane/router.server");
  return executeAiRouted({
    modelId: `video-${provider}`,
    modality: "video",
    execute: async (deployment) => {
      if (deployment.protocol !== "newapi-video") throw new Error(`视频部署 ${deployment.id} 的协议 ${deployment.protocol} 不受支持`);
      return execute({ provider, apiBase: deployment.provider.baseUrl, apiKey: deployment.apiKey, signal: deployment.abortSignal, adapterConfig: deployment.adapterConfig });
    },
  });
}

async function getUnifiedVideoConfigs(provider: VideoProviderName): Promise<VideoProviderConfig[]> {
  try {
    const { getAiControlPlaneConfig } = await import("@/lib/ai-control-plane/server");
    const config = await getAiControlPlaneConfig({ decryptSecrets: true, allowLegacy: true });
    if (!config) return [];
    const providers = new Map(config.providers.filter((item) => item.enabled && item.apiKey).map((item) => [item.id, item]));
    return config.deployments
      .filter((item) => item.enabled && item.modelId === `video-${provider}` && item.protocol === "newapi-video" && providers.has(item.providerId))
      .sort((a, b) => a.priority - b.priority || b.weight - a.weight)
      .map((item) => {
        const endpoint = providers.get(item.providerId)!;
        return { provider, apiKey: endpoint.apiKey || "", baseUrl: endpoint.baseUrl };
      });
  } catch { return []; }
}
