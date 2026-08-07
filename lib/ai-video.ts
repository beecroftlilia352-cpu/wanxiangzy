import { VIDEO_CREDIT_RATES } from "@/lib/model-pricing";

export type AiVideoResolution = "720p" | "1080p";
export type AiVideoDuration = 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15;
export type AiVideoFixedAspectRatio = "3:4" | "9:16" | "1:1" | "4:3" | "16:9";
export type AiVideoAspectRatio = "auto" | AiVideoFixedAspectRatio;
export type AiVideoModelMode = "fast" | "pro";
export type AiVideoAudioMode = "generated" | "custom" | "off";
export type AiVideoMode = "image-to-video" | "motion-control" | "first-last-frame";
export type AiVideoGenerationKind = "videoImageToVideo" | "videoMotion" | "videoFirstLastFrame";

export type AiVideoActionTemplate = {
  id: number;
  title: string;
  description: string;
  previewImage: string;
  previewVideo: string;
  promptContent: string;
};

export const AI_VIDEO_DEFAULT_ASPECT_RATIO = "auto" as const;
export const AI_VIDEO_DEFAULT_FIXED_ASPECT_RATIO = "3:4" as const;
export const AI_VIDEO_DEFAULT_RESOLUTION = "720p" as const;
export const AI_VIDEO_DEFAULT_DURATION: AiVideoDuration = 5;
export const AI_VIDEO_DEFAULT_AUDIO_MODE = "off" as const;
export const AI_VIDEO_DEFAULT_GENERATE_AUDIO = false;
export const AI_VIDEO_MIN_DURATION = 3;
export const AI_VIDEO_MAX_DURATION = 15;
export const AI_VIDEO_MAX_GENERATION_COUNT = 4;
export const AI_VIDEO_HAPPYHORSE_I2V_MODEL = "happyhorse-1.0-i2v";
export const AI_VIDEO_HAPPYHORSE_R2V_MODEL = "happyhorse-1.0-r2v";
export const AI_VIDEO_HAPPYHORSE_VIDEO_EDIT_MODEL = "happyhorse-1.0-video-edit";
const AI_VIDEO_TEMPLATE_ASSET_BASE = "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/video-templates";

export const AI_VIDEO_RESOLUTION_OPTIONS: Array<{ value: AiVideoResolution; label: string; description: string }> = [
  { value: "720p", label: "720p", description: "快速生成" },
  { value: "1080p", label: "1080p", description: "高清生成" },
];

export const AI_VIDEO_FAST_RESOLUTION_OPTIONS = AI_VIDEO_RESOLUTION_OPTIONS.filter((item) => item.value === "720p");

export const AI_VIDEO_MODEL_MODE_OPTIONS: Array<{ value: AiVideoModelMode; label: string; description: string }> = [
  { value: "pro", label: "高清模式", description: "HappyHorse 高清生成，支持 1080p" },
  { value: "fast", label: "快速模式", description: "HappyHorse 快速生成，仅 720p" },
];

export const AI_VIDEO_ASPECT_RATIO_OPTIONS: Array<{ value: AiVideoAspectRatio; label: string; description: string }> = [
  { value: "auto", label: "智能", description: "跟随上传图" },
  { value: "3:4", label: "3:4", description: "女装常用" },
  { value: "9:16", label: "9:16", description: "手机竖屏" },
  { value: "1:1", label: "1:1", description: "方图" },
  { value: "4:3", label: "4:3", description: "经典横幅" },
  { value: "16:9", label: "16:9", description: "横屏视频" },
];
export const AI_VIDEO_FIXED_ASPECT_RATIOS: AiVideoFixedAspectRatio[] = ["3:4", "9:16", "1:1", "4:3", "16:9"];

export const AI_VIDEO_AUDIO_MODE_OPTIONS: Array<{ value: Exclude<AiVideoAudioMode, "off">; label: string; description: string }> = [
  { value: "generated", label: "原生音效", description: "HappyHorse 按画面生成声音" },
];

export const AI_VIDEO_DURATION_OPTIONS: Array<{ value: AiVideoDuration; label: string }> = [
  { value: 3, label: "3秒" },
  { value: 5, label: "5秒" },
  { value: 10, label: "10秒" },
  { value: 15, label: "15秒" },
];

export const AI_VIDEO_ACTION_TEMPLATES: AiVideoActionTemplate[] = [
  {
    id: 1,
    title: "双手插袋",
    description: "展示整体廓形线条",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/01-hands-in-pockets.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/01-hands-in-pockets.mp4`,
    promptContent: "模特双手自然插入口袋，展示服装整体廓形与线条，镜头平稳跟随全身效果。",
  },
  {
    id: 2,
    title: "交叉抱臂",
    description: "突出包裹感和版型",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/02-crossed-arms.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/02-crossed-arms.mp4`,
    promptContent: "模特双臂自然交叉，突出服装包裹感、肩胸结构和版型，镜头缓慢推进。",
  },
  {
    id: 3,
    title: "下摆整理",
    description: "展示面料垂坠",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/03-hem-display.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/03-hem-display.mp4`,
    promptContent: "模特轻轻整理衣摆，展示面料自然垂坠、下摆长度和褶皱细节，镜头缓慢推进。",
  },
  {
    id: 4,
    title: "轻微动态",
    description: "展示自然动态平衡",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/04-subtle-movement.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/04-subtle-movement.mp4`,
    promptContent: "模特在原地做轻微重心变化，展现自然动态和平衡感，镜头平稳跟随。",
  },
  {
    id: 5,
    title: "领口细节",
    description: "聚焦领口和上身细节",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/05-neckline-details.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/05-neckline-details.mp4`,
    promptContent: "模特轻轻调整领口，突出衣领结构、上身细节和面料质感，镜头缓慢推进。",
  },
  {
    id: 6,
    title: "双手背后",
    description: "强调正面结构廓形",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/06-hands-behind-back.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/06-hands-behind-back.mp4`,
    promptContent: "模特双手自然放在身后，突出服装正面结构、胸肩线条和整体版型，镜头缓慢推进。",
  },
  {
    id: 7,
    title: "静态展示",
    description: "拉远展示全身效果",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/07-static-display.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/07-static-display.mp4`,
    promptContent: "模特双臂自然放松站立，镜头缓慢拉远，完整展示全身穿搭效果。",
  },
  {
    id: 8,
    title: "整体造型",
    description: "突出整体穿搭气场",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/08-full-look-display.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/08-full-look-display.mp4`,
    promptContent: "模特缓慢抬头并保持自然姿态，展示整体穿搭气场与服装效果，镜头缓慢推进。",
  },
  {
    id: 9,
    title: "行走展示",
    description: "展示自然行走动态",
    previewImage: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/09-walking-display.png`,
    previewVideo: `${AI_VIDEO_TEMPLATE_ASSET_BASE}/09-walking-display.mp4`,
    promptContent: "模特缓慢向前行走后短暂停留，展示全身穿搭和服装动态，镜头缓慢推进。",
  },
];

export function normalizeAiVideoModelMode(value: unknown, kind?: AiVideoMode | AiVideoGenerationKind): AiVideoModelMode {
  if (kind === "first-last-frame" || kind === "videoFirstLastFrame") return "pro";
  return value === "fast" ? "fast" : "pro";
}

export function getAiVideoResolutionOptions(modelMode: AiVideoModelMode) {
  return modelMode === "fast" ? AI_VIDEO_FAST_RESOLUTION_OPTIONS : AI_VIDEO_RESOLUTION_OPTIONS;
}

export function normalizeAiVideoResolution(value: unknown, modelMode: AiVideoModelMode = "pro"): AiVideoResolution {
  if (modelMode === "fast") return "720p";
  return value === "1080p" ? "1080p" : "720p";
}

export function normalizeAiVideoDuration(value: unknown): AiVideoDuration {
  const numericValue = Math.round(Number(value));
  const clamped = Math.min(AI_VIDEO_MAX_DURATION, Math.max(AI_VIDEO_MIN_DURATION, Number.isFinite(numericValue) ? numericValue : AI_VIDEO_DEFAULT_DURATION));
  return clamped as AiVideoDuration;
}

export function normalizeAiVideoAspectRatio(value: unknown): AiVideoAspectRatio {
  return AI_VIDEO_ASPECT_RATIO_OPTIONS.some((item) => item.value === value)
    ? value as AiVideoAspectRatio
    : AI_VIDEO_DEFAULT_ASPECT_RATIO;
}

export function normalizeAiVideoFixedAspectRatio(value: unknown): AiVideoFixedAspectRatio {
  return AI_VIDEO_FIXED_ASPECT_RATIOS.some((item) => item === value)
    ? value as AiVideoFixedAspectRatio
    : AI_VIDEO_DEFAULT_FIXED_ASPECT_RATIO;
}

export function getClosestAiVideoAspectRatio(width: unknown, height: unknown): AiVideoFixedAspectRatio | null {
  const numericWidth = Number(width);
  const numericHeight = Number(height);
  if (!Number.isFinite(numericWidth) || !Number.isFinite(numericHeight) || numericWidth <= 0 || numericHeight <= 0) return null;

  const sourceRatio = numericWidth / numericHeight;
  return AI_VIDEO_FIXED_ASPECT_RATIOS.reduce<{ value: AiVideoFixedAspectRatio; distance: number }>((closest, candidate) => {
    const [candidateWidth, candidateHeight] = candidate.split(":").map(Number);
    const candidateRatio = candidateWidth / candidateHeight;
    const distance = Math.abs(Math.log(sourceRatio / candidateRatio));
    return distance < closest.distance ? { value: candidate, distance } : closest;
  }, { value: AI_VIDEO_DEFAULT_FIXED_ASPECT_RATIO, distance: Number.POSITIVE_INFINITY }).value;
}

export function normalizeAiVideoGenCount(value: unknown) {
  const numericValue = Math.round(Number(value));
  if (!Number.isFinite(numericValue)) return 1;
  return Math.min(AI_VIDEO_MAX_GENERATION_COUNT, Math.max(1, numericValue));
}

export function normalizeAiVideoAudioMode(value: unknown): AiVideoAudioMode {
  if (value === "generated" || value === "custom" || value === "off") return value;
  return AI_VIDEO_DEFAULT_AUDIO_MODE;
}

export function normalizeAiVideoGenerateAudio(value: unknown) {
  if (value === undefined || value === null || value === "") return AI_VIDEO_DEFAULT_GENERATE_AUDIO;
  if (typeof value === "string") return !["false", "0", "off", "no"].includes(value.trim().toLowerCase());
  return value !== false;
}

export function getAiVideoAudioCreditCost(_input: {
  duration?: AiVideoDuration;
  audioMode?: AiVideoAudioMode;
  generateAudio?: boolean;
}) {
  return 0;
}

export function getAiVideoCreditCost(input: {
  modelMode?: AiVideoModelMode;
  resolution: AiVideoResolution;
  duration?: AiVideoDuration;
  genCount?: number;
  audioMode?: AiVideoAudioMode;
  generateAudio?: boolean;
}) {
  const modelMode = normalizeAiVideoModelMode(input.modelMode);
  const resolution = normalizeAiVideoResolution(input.resolution, modelMode);
  const duration = normalizeAiVideoDuration(input.duration);
  const genCount = normalizeAiVideoGenCount(input.genCount);
  const audioCost = getAiVideoAudioCreditCost({
    duration,
    audioMode: input.audioMode,
    generateAudio: input.generateAudio,
  });
  const rate = modelMode === "fast"
    ? VIDEO_CREDIT_RATES.fast["720p"]
    : VIDEO_CREDIT_RATES.pro[resolution];
  const perVideoCost = Math.max(rate.minimum, Math.ceil(duration * rate.perSecond));
  return (perVideoCost + audioCost) * genCount;
}

export function getAiVideoPerVideoCreditCost(input: {
  modelMode?: AiVideoModelMode;
  resolution: AiVideoResolution;
  duration?: AiVideoDuration;
  audioMode?: AiVideoAudioMode;
  generateAudio?: boolean;
}) {
  return getAiVideoCreditCost({ ...input, genCount: 1 });
}

export function getAiVideoHappyHorseModel(_modelMode: AiVideoModelMode, mode?: AiVideoMode | AiVideoGenerationKind) {
  if (mode === "motion-control" || mode === "videoMotion") return AI_VIDEO_HAPPYHORSE_VIDEO_EDIT_MODEL;
  if (mode === "first-last-frame" || mode === "videoFirstLastFrame") return AI_VIDEO_HAPPYHORSE_R2V_MODEL;
  return AI_VIDEO_HAPPYHORSE_I2V_MODEL;
}

export function getAiVideoTemplate(templateId?: number | null) {
  return AI_VIDEO_ACTION_TEMPLATES.find((item) => item.id === Number(templateId)) || null;
}

export function getAiVideoKind(mode: AiVideoMode): AiVideoGenerationKind {
  if (mode === "first-last-frame") return "videoFirstLastFrame";
  return mode === "motion-control" ? "videoMotion" : "videoImageToVideo";
}

export function getAiVideoPath(kind: AiVideoGenerationKind) {
  if (kind === "videoFirstLastFrame") return "/video/first-last-frame";
  return kind === "videoMotion" ? "/video/motion-control" : "/video";
}
