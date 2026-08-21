import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import faceSwapAssets from "@/lib/face-swap-assets.generated.json";
import { STANDARD_MULTI_IMAGE_UPLOAD_LIMIT } from "@/lib/multi-image-upload-limits";

export type FaceSwapSampleImage = {
  id: number;
  url: string;
  width: number;
  height: number;
};

export type FaceSwapLibraryItem = {
  id: number;
  gender: "female" | "male";
  url: string;
  sort: number;
};

type GeneratedFaceSwapAssets = {
  sampleImages: FaceSwapSampleImage[];
  library: FaceSwapLibraryItem[];
};

const FACE_SWAP_ASSETS = faceSwapAssets as GeneratedFaceSwapAssets;

export const FACE_SWAP_SAMPLE_IMAGES: FaceSwapSampleImage[] = FACE_SWAP_ASSETS.sampleImages;
export const FACE_SWAP_LIBRARY: FaceSwapLibraryItem[] = FACE_SWAP_ASSETS.library;

if (process.env.NODE_ENV !== "production") {
  const legacy = [...FACE_SWAP_SAMPLE_IMAGES, ...FACE_SWAP_LIBRARY].find((asset) => isLegacyOssAssetUrl(asset.url));
  if (legacy) {
    console.warn("[face-swap] legacy OSS asset is still present; run scripts/sync-face-swap-assets.mjs", legacy);
  }
}

function isLegacyOssAssetUrl(url: string) {
  return url.includes("zhiyi-image.oss-cn-hangzhou.aliyuncs.com") || url.includes("aliyuncs.com/devops/comfyui");
}

export const DEFAULT_FACE_SWAP_TEXTURE_ENHANCE = false;
export const MAX_FACE_SWAP_SOURCE_IMAGES = STANDARD_MULTI_IMAGE_UPLOAD_LIMIT;
export const MAX_FACE_SWAP_RESULT_IMAGES = MAX_FACE_SWAP_SOURCE_IMAGES * 4;

export type FaceSwapMode = "features" | "featuresHairSkin";

export const DEFAULT_FACE_SWAP_MODE: FaceSwapMode = "features";

export const FACE_SWAP_MODE_OPTIONS: Array<{ value: FaceSwapMode; label: string; description: string }> = [
  {
    value: "features",
    label: "仅换五官",
    description: "保留原图发型肤色",
  },
  {
    value: "featuresHairSkin",
    label: "换五官发型肤色",
    description: "同步目标脸整体外观",
  },
];

export const FACE_SWAP_FEATURES_ONLY_NOTE =
  "仅迁移目标脸五官身份，保留原图肤色、发型、发色、表情、服装和场景。";

export const FACE_SWAP_HAIR_SKIN_NOTE =
  "迁移目标脸五官身份，并同步目标脸可见发型、发色、肤色和妆感；仍保留原图身体、服装、姿势和场景。";

export const FACE_SWAP_NOTE = FACE_SWAP_FEATURES_ONLY_NOTE;

export const FACE_SWAP_FEATURES_ONLY_PROMPT = [
  "Production face swap, source-locked local edit. Use image 1 as the fixed base photo; do not recreate, reframe, beautify, or generate a new photo.",
  "Image 1 is the original model photo and the target canvas. Image 2 is the target face identity reference.",
  "Scope mode: facial features only. Replace only the inner facial identity of the person in image 1 with the recognizable identity from image 2.",
  "Identity priority: image 2 must control eye shape, eyelids, eyebrow structure, nose bridge/tip/nostrils, lip shape, philtrum, cheekbones, jaw/chin, face outline, facial proportions, age impression, and unique identity markers.",
  "Anti-identity-drift rule: do not westernize, caucasianize, east-asianize, beautify, average, dollify, or turn image 2 into a generic fashion face. Preserve ethnicity-specific facial geometry faithfully, especially when image 2 is Asian, Black, Latino, Middle Eastern, South Asian, mixed-race, or any non-Western identity.",
  "Keep image 1 unchanged for body, pose, head angle, gaze direction, facial expression, hairstyle, hairline silhouette, hair color, skin tone, makeup color family, neck, ears when visible, body proportions, clothing, accessories, background, camera angle, framing, lighting, exposure, contrast, white balance, color temperature, shadows, highlights, grain/noise, and camera texture.",
  FACE_SWAP_FEATURES_ONLY_NOTE,
  "Use image 2 only for facial identity geometry. Do not copy image 2 hairstyle, hairline style, skin tone, makeup style, accessories, expression, pose, clothing, background, or lighting.",
  "Preserve all source-image accessories exactly. If image 1 has glasses, sunglasses, tinted lenses, earrings, necklace, hat, rings, or hair accessories, keep their exact shape, color, transparency, reflection, position, and occlusion in front of the swapped face.",
  "Preserve the source facial expression and micro-expression from image 1, including mouth tension, eyelid openness, gaze direction, brow tension, and calm or serious mood. Do not replace it with the neutral expression from image 2.",
  "Preserve real skin texture from image 1: pores, freckles, moles, tiny blemishes, natural asymmetry, local redness, shadows, and realistic skin grain. Do not smooth skin, whiten skin, make porcelain skin, remove freckles or blemishes, or create a generic beauty face.",
  "Preserve image 1 garment design exactly: clothing color, print, logo, text, fabric texture, seams, folds, sleeve shape, hem, pants/skirt, styling, and hand-clothing interaction.",
  "Source tone lock: do not globally retouch, relight, recolor, HDR, increase clarity, increase local contrast, add sharpening, add super-resolution texture, add a commercial filter, or change the source photo's contrast/exposure balance.",
  "Fine textile safety: preserve stripes, ribs, knit, pants weave, mesh, plaid, logo/text and repeated patterns only at the scale visible in image 1; do not create moire, wavy fabric lines, water-ripple patterns, vibrating stripes, fake fibers, or invented textile detail.",
  "The transition around forehead, jawline, ears, neck, and hairline must be seamless and realistic. Keep the original model skin tone and do not whiten, tan, beautify, age-shift, change makeup style, change hairstyle, remove accessories, or change clothing.",
  "Output a photorealistic source-matched fashion photo with faithful source tone, natural pores, no face distortion, no extra people, no watermark, no AI-render look.",
].join("\n");

export const FACE_SWAP_HAIR_SKIN_PROMPT = [
  "Production face swap, source-locked local edit. Use image 1 as the fixed base photo; do not recreate, reframe, beautify, or generate a new photo.",
  "Image 1 is the original model photo and the target canvas. Image 2 is the target face identity reference.",
  "Scope mode: facial identity + hairstyle + skin tone. Transfer the recognizable identity from image 2 plus its visible hairstyle, hairline, hair color, complexion/skin tone, undertone, and makeup color direction.",
  "Identity priority: image 2 must control eye shape, eyelids, eyebrow structure, nose bridge/tip/nostrils, lip shape, philtrum, cheekbones, jaw/chin, face outline, facial proportions, age impression, and unique identity markers.",
  "Anti-identity-drift rule: do not westernize, caucasianize, east-asianize, beautify, average, dollify, or turn image 2 into a generic fashion face. Preserve ethnicity-specific facial geometry faithfully, especially when image 2 is Asian, Black, Latino, Middle Eastern, South Asian, mixed-race, or any non-Western identity.",
  "Appearance transfer boundary: transfer image 2 hair and skin appearance only for the head/face region and any visible skin tone continuity needed for a natural neck or exposed-skin transition. Keep body shape, body proportions, pose, clothing, accessories, background, lighting, camera angle, framing, and composition from image 1.",
  FACE_SWAP_HAIR_SKIN_NOTE,
  "Adapt image 2 hairstyle to the exact head angle, scale, crop, lighting, and physical space of image 1. Hair edges must blend naturally with the source background without helmet hair, hard cutouts, pasted wig edges, or changed clothing.",
  "Match transferred skin tone to image 1 lighting and exposure so the face, neck, and visible skin are continuous. Do not create a mask edge, floating head, mismatched hands, gray face, porcelain skin, or over-smoothed beauty retouch.",
  "Preserve image 1 facial expression, gaze direction, head angle, mouth tension, eyelid openness, body posture, hand placement, garment interaction, all clothing, all accessories, background, camera texture, exposure, contrast, white balance, color temperature, shadows, highlights, grain/noise, and framing.",
  "Preserve image 1 garment design exactly: clothing color, print, logo, text, fabric texture, seams, folds, sleeve shape, hem, pants/skirt, styling, and hand-clothing interaction.",
  "Source tone lock: do not globally retouch, relight, recolor, HDR, increase clarity, increase local contrast, add sharpening, add super-resolution texture, add a commercial filter, or change the source photo's contrast/exposure balance.",
  "Fine textile safety: preserve stripes, ribs, knit, pants weave, mesh, plaid, logo/text and repeated patterns only at the scale visible in image 1; do not create moire, wavy fabric lines, water-ripple patterns, vibrating stripes, fake fibers, or invented textile detail.",
  "Output a photorealistic source-matched fashion photo with faithful source camera tone, natural pores, natural hair integration, no extra people, no watermark, no AI-render look.",
].join("\n");

export const DEFAULT_FACE_SWAP_PROMPT = FACE_SWAP_FEATURES_ONLY_PROMPT;

export const FACE_SWAP_TEXTURE_ENHANCE_PROMPT = [
  "服装轻量细节恢复规则：开启后仍以图1为固定底图，只允许在服装可见区域做保守的局部清晰度恢复；脸部身份仍只来自图2，不能把任务变成全图商业精修或重新生成照片。",
  "增强范围：在不改变图1服装款式、固有色、图案、logo、文字、版型、长度、穿搭关系、光线和阴影层次的前提下，轻量恢复原图已经存在的缝线、袖口、领口、下摆、纽扣、拉链、口袋边缘、自然褶皱、接触阴影和可见材质细节。",
  "影调锁定：增强服装时必须保持图1原始曝光、对比度、白平衡、色温、肤色、阴影/高光层次、颗粒/噪点和相机质感；不要全图调色、HDR、提高 clarity、提高局部反差、额外锐化、超分纹理、商业精修滤镜或干净曝光重算。",
  "细密纹理安全：细条纹、罗纹、针织、裤纹、网纱、格纹和重复图案只按图1可见尺度自然保留；不要把模糊区域脑补成高频织纹，不要生成摩尔纹、波纹、水波纹、频闪条纹、振荡线、假纤维或不存在的面料纹理。",
  "分区控制：只对服装做轻量局部细节恢复；脸部只能做自然融合，必须保留图1表情、肤色、毛孔、雀斑、痣、瑕疵和皮肤颗粒，不要磨皮、不要美白、不要网红脸。",
  "负面约束：不要改变服装结构、颜色、图形、文字或logo，不要新增不存在的纹样，不要把衣服变成另一种面料，不要塑料感、蜡像感、过锐化光晕、磨皮、雪白皮或AI渲染感。",
].join("\n");

export function normalizeFaceSwapMode(value: unknown): FaceSwapMode {
  if (value === "featuresHairSkin" || value === "faceHairSkin" || value === "appearance") return "featuresHairSkin";
  if (value === "features" || value === "facialFeaturesOnly" || value === "faceOnly") return "features";

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return DEFAULT_FACE_SWAP_MODE;
    if (
      normalized.includes("featureshairskin") ||
      normalized.includes("hairskin") ||
      normalized.includes("appearance") ||
      normalized.includes("hair") ||
      normalized.includes("skin") ||
      normalized.includes("发型") ||
      normalized.includes("肤色") ||
      normalized.includes("妆感")
    ) {
      return "featuresHairSkin";
    }
    if (normalized.includes("features") || normalized.includes("五官") || normalized.includes("仅换")) return "features";
  }

  return DEFAULT_FACE_SWAP_MODE;
}

export function getFaceSwapModeLabel(mode: unknown) {
  const normalized = normalizeFaceSwapMode(mode);
  return FACE_SWAP_MODE_OPTIONS.find((option) => option.value === normalized)?.label || FACE_SWAP_MODE_OPTIONS[0].label;
}

export function getFaceSwapModeNote(mode: unknown) {
  return normalizeFaceSwapMode(mode) === "featuresHairSkin" ? FACE_SWAP_HAIR_SKIN_NOTE : FACE_SWAP_FEATURES_ONLY_NOTE;
}

function getFaceSwapBasePrompt(mode: FaceSwapMode) {
  return mode === "featuresHairSkin" ? FACE_SWAP_HAIR_SKIN_PROMPT : FACE_SWAP_FEATURES_ONLY_PROMPT;
}

function inferFaceSwapModeFromPrompt(prompt: string) {
  if (/Scope mode:\s*facial identity \+ hairstyle \+ skin tone|换五官发型肤色|hair and skin appearance/i.test(prompt)) {
    return "featuresHairSkin" satisfies FaceSwapMode;
  }
  return DEFAULT_FACE_SWAP_MODE;
}

export function buildFaceSwapPrompt(
  extra?: string,
  textureEnhance = DEFAULT_FACE_SWAP_TEXTURE_ENHANCE,
  mode: FaceSwapMode = DEFAULT_FACE_SWAP_MODE,
) {
  const userExtra = typeof extra === "string" ? extra.trim() : "";
  const parts = [getFaceSwapBasePrompt(normalizeFaceSwapMode(mode))];
  if (textureEnhance) parts.push(FACE_SWAP_TEXTURE_ENHANCE_PROMPT);
  if (userExtra) parts.push(`User extra instruction: ${userExtra}`);
  return parts.join("\n\n");
}

export function normalizeFaceSwapTextureEnhance(value: unknown) {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return DEFAULT_FACE_SWAP_TEXTURE_ENHANCE;
}

export function isFaceSwapSystemPrompt(value: string) {
  const normalized = value.trim();
  if (!normalized) return false;
  return [
    "Production face swap, source-locked local edit.",
    "Image 1 is the original model photo and the target canvas.",
    "Image 2 is the target face identity reference.",
    "Scope mode: facial features only.",
    "Scope mode: facial identity + hairstyle + skin tone.",
    "Anti-identity-drift rule:",
    "Replace only the inner facial identity",
    "Hard rule: image 1 is the target canvas",
  ].some((marker) => normalized.includes(marker));
}

export function getFaceSwapUserPromptFromPayload(payload: { prompt?: unknown; userPrompt?: unknown }) {
  if (typeof payload.userPrompt === "string") return payload.userPrompt.trim();

  const storedPrompt = typeof payload.prompt === "string" ? payload.prompt.trim() : "";
  if (!storedPrompt) return "";

  const marker = "User extra instruction:";
  const markerIndex = storedPrompt.lastIndexOf(marker);
  if (markerIndex >= 0) {
    const extraBlock = storedPrompt.slice(markerIndex + marker.length).trim();
    const hardRuleIndex = extraBlock.search(/\n\s*Hard rule:/);
    return (hardRuleIndex >= 0 ? extraBlock.slice(0, hardRuleIndex) : extraBlock).trim();
  }

  return isFaceSwapSystemPrompt(storedPrompt) ? "" : storedPrompt;
}

export function enforceFaceSwapPromptRequirements(prompt: string, mode?: FaceSwapMode) {
  const normalized = prompt.trim() || DEFAULT_FACE_SWAP_PROMPT;
  const normalizedMode = mode ? normalizeFaceSwapMode(mode) : inferFaceSwapModeFromPrompt(normalized);
  const required = [
    "Hard rule: image 1 is the target canvas; image 2 is the target identity reference.",
    "Hard rule: copy image 2 recognizable identity anatomy faithfully; preserve ethnicity-specific facial geometry and do not westernize, caucasianize, beautify, average, dollify, or genericize the face.",
    "Hard rule: preserve image 1 body, pose, clothing, garment print, accessories, background, lighting, exposure, contrast, camera, framing, and composition.",
    "Hard rule: preserve image 1 expression, gaze, head angle, glasses, sunglasses, earrings, necklace, hat, and all accessories unless the selected mode explicitly allows hair/skin transfer.",
    "Hard rule: preserve pores, freckles, moles, blemishes, natural skin grain, and realistic facial asymmetry; no beauty smoothing, porcelain skin, or generic makeup.",
    "Hard rule: preserve source exposure, contrast, white balance, color temperature, shadows, highlights, grain/noise, and camera texture; do not globally retouch, relight, recolor, HDR, increase clarity, increase local contrast, add sharpening, or add a commercial filter.",
    "Hard rule: preserve fine textile patterns at source scale; do not create moire, wavy fabric lines, water-ripple patterns, vibrating stripes, fake fibers, or invented textile detail.",
    "Do not blend two identities; the final face must read as image 2's person, integrated naturally into image 1.",
  ];
  if (normalizedMode === "featuresHairSkin") {
    required.push(
      "Hard rule: mode is 换五官发型肤色 / facial identity plus hair and skin. Transfer image 2 recognizable facial identity, visible hairstyle, hairline, hair color, skin tone, complexion undertone, and makeup color direction while matching image 1 lighting.",
      "Hard rule: even in hair/skin mode, do not change image 1 body shape, pose, clothing, garment color, print, accessories, background, camera, framing, or composition.",
      "Hard rule: face, neck, and visible skin transitions must be continuous and realistic; no pasted head, mask edge, gray face, mismatched hands, helmet hair, hard wig cutout, or skin-tone seam."
    );
  } else {
    required.push(
      `Hard rule: mode is 仅换五官 / facial features only. ${FACE_SWAP_FEATURES_ONLY_NOTE}`,
      "Hard rule: do not copy image 2 hairstyle, hairline style, hair color, skin tone, makeup style, expression, pose, clothing, background, or lighting.",
      "Do not change body, pose, hairstyle, hair color, skin tone, clothing, garment print, accessories, background, lighting, exposure, contrast, camera, framing, or image 1 composition."
    );
  }
  if (hasTextureEnhancePrompt(normalized)) {
    required.push(
      "Hard rule: texture enhancement is active only as conservative local garment detail recovery; keep image 1 clothing structure, color, graphics, text, exposure, contrast, shadows, white balance, and composition unchanged.",
      "Hard rule: do not apply beauty smoothing, whitening, porcelain skin, generic makeup, face retouching, global sharpening, clarity boost, local contrast boost, or moire-prone fabric enhancement while recovering clothing detail."
    );
  }
  const missing = required.filter((line) => !normalized.includes(line));
  return missing.length ? `${normalized}\n\n${missing.join("\n")}` : normalized;
}

function hasTextureEnhancePrompt(prompt: string) {
  return /服装质感增强规则|服装轻量细节恢复规则|Texture enhancement mode|texture enhancement is active/i.test(prompt);
}

export function normalizeFaceSwapCount(value: unknown) {
  const count = Number(value || 1);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.floor(count), 1), 4);
}

export function normalizeFaceSwapSourceUrls(value: unknown, fallback?: unknown) {
  const values = Array.isArray(value) ? value : [];
  const allValues = values.length ? values : fallback !== undefined ? [fallback] : [];
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const item of allValues) {
    if (typeof item !== "string") continue;
    const url = item.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
    if (urls.length >= MAX_FACE_SWAP_SOURCE_IMAGES) break;
  }

  return urls;
}

export type FaceSwapApiPayload = {
  sourceUrl: string;
  sourceUrls?: string[];
  faceUrl: string;
  aiModel: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  userPrompt?: string;
  prompt: string;
  genCount: number;
  textureEnhance?: boolean;
  faceSwapMode?: FaceSwapMode;
};
