import type { ImagePreviewAction } from "@/lib/studio-image-preview";
import type { TryOnClothingRole } from "@/lib/tryon-upload-rules";

export const CLOTHING_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE = 0.5;
export const REFERENCE_ANALYSIS_CLIENT_CACHE_MIN_CONFIDENCE = 0.5;

export const CLOTHING_ROLE_ORDER: Record<TryOnClothingRole, number> = {
  upper: 0,
  lower: 1,
  single: 0,
  extra: 3,
};

export const TRYON_STATUS_POLL_BASE_TIMEOUT_MS = 20 * 60 * 1000;
export const TRYON_STATUS_POLL_PER_IMAGE_MS = 4 * 60 * 1000;
export const TRYON_STATUS_POLL_MAX_TIMEOUT_MS = 90 * 60 * 1000;
export const TRYON_STATUS_FETCH_TIMEOUT_MS = 8_000;
export const TRYON_STATUS_HIDDEN_POLL_MS = 30_000;
export const TRYON_STATUS_QUEUE_REFRESH_MS = 20_000;

export const MAX_TRYON_REFERENCE_IMAGES = 8;
export const MAX_TRYON_OUTPUT_IMAGES = 32;
export const TRYON_REFERENCE_UPLOAD_CONCURRENCY = 2;

export const TRYON_PREVIEW_ACTIONS: ImagePreviewAction[] = [
  { kind: "download", label: "下载图片" },
  { kind: "copy", label: "复制链接" },
  { kind: "repair", label: "AI修图" },
  { kind: "aiVideo", label: "AI视频" },
  { kind: "modelBackground", label: "换背景" },
  { kind: "pose", label: "姿势裂变" },
  { kind: "productSet", label: "商品套图" },
  { kind: "regenerateAll", label: "重新创作" },
  { kind: "feedback", label: "反馈" },
];

export const TRYON_FACE_MODEL_BANANA_NOTICE =
  "已选择模特脸时，Banana 的“参考图 + 模特脸”融合效果可能不好。当前推荐用 GPT-Image-2；如果想保留 Banana 的换装质感，先取消模特脸完成换装，再到换脸模块替换脸部。";
