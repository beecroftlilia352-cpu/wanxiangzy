export type AiVideoResolution = "720p";
export type AiVideoDuration = 5 | 10;
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

export const AI_VIDEO_DEFAULT_ASPECT_RATIO = "9:16" as const;
export const AI_VIDEO_SEEDANCE_MODEL = "doubao-seedance-2-0-fast-260128";
export const AI_VIDEO_SEEDANCE_FIRST_LAST_FRAME_MODEL = "doubao-seedance-2-0-260128";
const AI_VIDEO_TEMPLATE_ASSET_BASE = "https://vastweargen-images.oss-cn-hongkong.aliyuncs.com/site-assets/original/video-templates";

export const AI_VIDEO_RESOLUTION_OPTIONS: Array<{ value: AiVideoResolution; label: string; cost: number }> = [
  { value: "720p", label: "720p", cost: 6 },
];

export const AI_VIDEO_DURATION_OPTIONS: Array<{ value: AiVideoDuration; label: string; cost: number }> = [
  { value: 5, label: "5秒", cost: 6 },
  { value: 10, label: "10秒", cost: 10 },
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

export function normalizeAiVideoResolution(value: unknown): AiVideoResolution {
  return "720p";
}

export function normalizeAiVideoDuration(value: unknown): AiVideoDuration {
  return Number(value) === 10 ? 10 : 5;
}

export function getAiVideoCreditCost(resolution: AiVideoResolution, duration?: AiVideoDuration) {
  if (duration) {
    return AI_VIDEO_DURATION_OPTIONS.find((item) => item.value === duration)?.cost || 6;
  }
  return AI_VIDEO_RESOLUTION_OPTIONS.find((item) => item.value === resolution)?.cost || 6;
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
