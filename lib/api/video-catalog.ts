import type {
  AiVideoAudioMode,
  AiVideoDuration,
  AiVideoModelMode,
  AiVideoResolution,
} from "@/lib/ai-video";

export type VideoProviderName = "minimax" | "seedance";

export type VideoModelPrice = { minimum: number; perSecond: number };

export type VideoCatalogEntry = {
  provider: VideoProviderName;
  mode: AiVideoModelMode;
  resolution: AiVideoResolution;
  upstreamModel: string;
  resolutionLabel: string;
  price: VideoModelPrice;
  minDuration: number;
  maxDuration: number;
};

/**
 * Upstream model + pricing catalog for the video providers delivered through
 * the new.bi new-api gateway (`POST /v1/video/generations`).
 *
 * Resolution is selected by the upstream model id, not by a `resolution`
 * request field. Prices are in 灵点 (credits); roughly 8 credits ≈ 1 USD.
 */
export const VIDEO_CATALOG: readonly VideoCatalogEntry[] = [
  // MiniMax H3
  {
    provider: "minimax",
    mode: "pro",
    resolution: "768p",
    upstreamModel: "minimax-h3-768p",
    resolutionLabel: "768p",
    price: { minimum: 15, perSecond: 3 },
    minDuration: 5,
    maxDuration: 15,
  },
  {
    provider: "minimax",
    mode: "pro",
    resolution: "2k",
    upstreamModel: "minimax-h3",
    resolutionLabel: "2K",
    price: { minimum: 20, perSecond: 4 },
    minDuration: 5,
    maxDuration: 15,
  },
  // Seedance 2.0
  {
    provider: "seedance",
    mode: "mini",
    resolution: "720p",
    upstreamModel: "doubao-seedance-2-0-mini-260615",
    resolutionLabel: "720p",
    price: { minimum: 20, perSecond: 5 },
    minDuration: 4,
    maxDuration: 15,
  },
  {
    provider: "seedance",
    mode: "fast",
    resolution: "480p",
    upstreamModel: "doubao-seedance-2-0-fast-260128-480p",
    resolutionLabel: "480p",
    price: { minimum: 16, perSecond: 4 },
    minDuration: 4,
    maxDuration: 15,
  },
  {
    provider: "seedance",
    mode: "fast",
    resolution: "720p",
    upstreamModel: "doubao-seedance-2-0-fast-260128",
    resolutionLabel: "720p",
    price: { minimum: 24, perSecond: 6 },
    minDuration: 4,
    maxDuration: 15,
  },
  {
    provider: "seedance",
    mode: "pro",
    resolution: "720p",
    upstreamModel: "doubao-seedance-2-0-260128",
    resolutionLabel: "720p",
    price: { minimum: 28, perSecond: 7 },
    minDuration: 4,
    maxDuration: 15,
  },
  {
    provider: "seedance",
    mode: "pro",
    resolution: "1080p",
    upstreamModel: "doubao-seedance-2-0-260128-1080p",
    resolutionLabel: "1080p",
    price: { minimum: 80, perSecond:20 },
    minDuration: 4,
    maxDuration: 15,
  },
];

export const VIDEO_MODE_ORDER: readonly AiVideoModelMode[] = ["mini", "fast", "pro"];

export const VIDEO_MODE_LABELS: Record<AiVideoModelMode, string> = {
  mini: "轻量模式",
  fast: "快速模式",
  pro: "高清模式",
};

export const VIDEO_MODE_DESCRIPTIONS: Record<AiVideoModelMode, string> = {
  mini: "Seedance mini，720p",
  fast: "Seedance fast，支持 480p/720p",
  pro: "标准/高清，支持 720p/1080p（MiniMax 为 768p/2K）",
};

export type VideoModeOption = {
  value: AiVideoModelMode;
  label: string;
  description: string;
};

export type VideoResolutionOption = {
  value: AiVideoResolution;
  label: string;
  description: string;
  pricePerSecond: number;
  minimum: number;
};

export function getVideoCatalogEntries(provider: VideoProviderName): VideoCatalogEntry[] {
  return VIDEO_CATALOG.filter((entry) => entry.provider === provider);
}

export function getVideoModes(provider: VideoProviderName): VideoModeOption[] {
  const modes = new Set(getVideoCatalogEntries(provider).map((entry) => entry.mode));
  return VIDEO_MODE_ORDER.filter((mode) => modes.has(mode)).map((mode) => ({
    value: mode,
    label: VIDEO_MODE_LABELS[mode],
    description: VIDEO_MODE_DESCRIPTIONS[mode],
  }));
}

export function getVideoResolutions(provider: VideoProviderName, mode: AiVideoModelMode): VideoResolutionOption[] {
  return getVideoCatalogEntries(provider)
    .filter((entry) => entry.mode === mode)
    .map((entry) => ({
      value: entry.resolution,
      label: entry.resolutionLabel,
      description: `${entry.resolutionLabel} · ${entry.price.perSecond} 灵点/秒`,
      pricePerSecond: entry.price.perSecond,
      minimum: entry.price.minimum,
    }));
}

export function getVideoDefaultMode(provider: VideoProviderName): AiVideoModelMode {
  const modes = getVideoModes(provider);
  return modes[0]?.value ?? "pro";
}

export function getVideoDefaultResolution(provider: VideoProviderName, mode: AiVideoModelMode): AiVideoResolution {
  const resolutions = getVideoResolutions(provider, mode);
  return resolutions[0]?.value ?? "720p";
}

export function findVideoCatalogEntry(
  provider: VideoProviderName,
  mode: AiVideoModelMode,
  resolution: AiVideoResolution,
): VideoCatalogEntry | undefined {
  return VIDEO_CATALOG.find(
    (entry) => entry.provider === provider && entry.mode === mode && entry.resolution === resolution,
  );
}

export function resolveUpstreamVideoModel(
  provider: VideoProviderName,
  mode: AiVideoModelMode,
  resolution: AiVideoResolution,
): string {
  const entry = findVideoCatalogEntry(provider, mode, resolution);
  if (!entry) {
    throw new Error(`视频供应商 ${provider} 不支持 ${mode}/${resolution} 组合`);
  }
  return entry.upstreamModel;
}

export function getVideoModelPrice(
  provider: VideoProviderName,
  mode: AiVideoModelMode,
  resolution: AiVideoResolution,
): VideoModelPrice {
  const entry = findVideoCatalogEntry(provider, mode, resolution);
  if (!entry) throw new Error(`视频供应商 ${provider} 不支持 ${mode}/${resolution} 组合`);
  return entry.price;
}

export function getVideoDurationRange(provider: VideoProviderName): { min: number; max: number } {
  const entries = getVideoCatalogEntries(provider);
  if (!entries.length) return { min: 5, max: 15 };
  return {
    min: Math.min(...entries.map((entry) => entry.minDuration)),
    max: Math.max(...entries.map((entry) => entry.maxDuration)),
  };
}

export function getVideoDurationOptions(provider: VideoProviderName): number[] {
  const { min, max } = getVideoDurationRange(provider);
  const options = new Set<number>([min, 5, 10, max]);
  return [...options]
    .filter((value) => value >= min && value <= max)
    .sort((a, b) => a - b);
}

export function clampVideoDuration(provider: VideoProviderName, duration: AiVideoDuration | number | undefined): number {
  const { min, max } = getVideoDurationRange(provider);
  const numeric = Math.round(duration ?? 5);
  return Math.min(max, Math.max(min, Number.isFinite(numeric) ? numeric : 5));
}

export function getVideoCreditCost(params: {
  provider: VideoProviderName;
  modelMode: AiVideoModelMode;
  resolution: AiVideoResolution;
  duration?: AiVideoDuration | number;
  genCount?: number;
  audioMode?: AiVideoAudioMode;
  generateAudio?: boolean;
}): number {
  const { provider, genCount = 1, audioMode } = params;
  const selection = resolveVideoSelection(provider, params.modelMode, params.resolution);
  const price = getVideoModelPrice(provider, selection.mode, selection.resolution);
  const duration = clampVideoDuration(provider, params.duration);
  const perVideoCost = Math.max(price.minimum, Math.ceil(duration * price.perSecond));
  const audioCost = getVideoAudioCreditCost(audioMode);
  return (perVideoCost + audioCost) * Math.max(1, Math.round(genCount));
}

export function getVideoPerVideoCreditCost(params: {
  provider: VideoProviderName;
  modelMode: AiVideoModelMode;
  resolution: AiVideoResolution;
  duration?: AiVideoDuration | number;
  audioMode?: AiVideoAudioMode;
  generateAudio?: boolean;
}): number {
  return getVideoCreditCost({ ...params, genCount: 1 });
}

function getVideoAudioCreditCost(audioMode?: AiVideoAudioMode): number {
  // Audio is generated natively by MiniMax H3 / Seedance and is included in the
  // base price; custom audio is not charged separately for now.
  return 0;
}

export function supportsVideoMotionControl(_provider: VideoProviderName): boolean {
  // new.bi's openai-video gateway drops `reference_video` for both MiniMax H3
  // and Seedance, so motion-from-reference-video is not available.
  return false;
}

export function supportsVideoFirstLastFrame(_provider: VideoProviderName): boolean {
  // Both providers forward `first_frame_image` + `last_frame_image`.
  return true;
}

export function resolveVideoSelection(
  provider: VideoProviderName,
  requestedMode: AiVideoModelMode,
  requestedResolution: AiVideoResolution,
): { mode: AiVideoModelMode; resolution: AiVideoResolution } {
  const modes = getVideoModes(provider);
  const mode = modes.some((item) => item.value === requestedMode)
    ? requestedMode
    : getVideoDefaultMode(provider);
  const resolutions = getVideoResolutions(provider, mode);
  const resolution = resolutions.some((item) => item.value === requestedResolution)
    ? requestedResolution
    : getVideoDefaultResolution(provider, mode);
  return { mode, resolution };
}

export function getVideoProviderBaseUrl(provider: VideoProviderName): string {
  return "https://api.new.bi";
}
