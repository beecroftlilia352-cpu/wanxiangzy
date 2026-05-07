import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";
import faceSwapAssets from "@/lib/face-swap-assets.generated.json";

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

export const FACE_SWAP_NOTE =
  "Swap Face only changes facial features. It does not change the model's skin tone or hairstyle.";

export const DEFAULT_FACE_SWAP_PROMPT = [
  "Image 1 is the original model photo and the target canvas. Image 2 is the target face identity reference.",
  "Replace only the inner facial identity of the person in image 1 with the identity from image 2.",
  "Keep image 1 unchanged for body, pose, head angle, gaze direction, facial expression, hairstyle, hair color, skin tone, neck, body proportions, clothing, accessories, background, camera angle, framing, lighting, and commercial photography quality.",
  FACE_SWAP_NOTE,
  "Use image 2 only for facial identity geometry: eyes, eyebrows, nose, lips, cheekbones, jaw shape, face structure, and recognizable identity. Do not copy image 2 hairstyle, hairline style, skin tone, makeup style, accessories, expression, pose, clothing, background, or lighting.",
  "Preserve all source-image accessories exactly. If image 1 has glasses, sunglasses, tinted lenses, earrings, necklace, hat, rings, or hair accessories, keep their exact shape, color, transparency, reflection, position, and occlusion in front of the swapped face.",
  "Preserve the source facial expression and micro-expression from image 1, including mouth tension, eyelid openness, gaze direction, brow tension, and calm or serious mood. Do not replace it with the neutral expression from image 2.",
  "Preserve real skin texture from image 1: pores, freckles, moles, tiny blemishes, natural asymmetry, local redness, shadows, and realistic skin grain. Do not smooth skin, whiten skin, make porcelain skin, remove freckles or blemishes, or create a generic beauty face.",
  "Preserve image 1 garment design exactly: clothing color, print, logo, text, fabric texture, seams, folds, sleeve shape, hem, pants/skirt, styling, and hand-clothing interaction.",
  "The transition around forehead, jawline, ears, neck, and hairline must be seamless and realistic. Keep the original model skin tone and do not whiten, tan, beautify, age-shift, change makeup style, change hairstyle, remove accessories, or change clothing.",
  "Output a photorealistic fashion image with faithful source details, natural pores, no face distortion, no extra people, no watermark, no AI-render look.",
].join("\n");

export const FACE_SWAP_TEXTURE_ENHANCE_PROMPT = [
  "Texture enhancement mode is enabled, but identity and source preservation are still higher priority than enhancement.",
  "Enhance only the finished commercial image quality and garment material: clearer fabric weave, knit/cotton texture, seams, print edges, logo/text clarity, folds, shadow depth, product sharpness, clean exposure, and premium fashion retouching.",
  "Keep face identity, source expression, glasses/accessories, skin tone, real pores, freckles, moles, small blemishes, hairstyle, clothing design, garment color, scene, lighting direction, and composition stable.",
  "Do not smooth the face, do not remove freckles or skin imperfections, do not whiten skin, do not change makeup style, do not change hairstyle, do not change body shape, and do not alter clothing structure, color, graphics, or text.",
].join("\n");

export function buildFaceSwapPrompt(extra?: string, textureEnhance = false) {
  const userExtra = typeof extra === "string" ? extra.trim() : "";
  const parts = [DEFAULT_FACE_SWAP_PROMPT];
  if (textureEnhance) parts.push(FACE_SWAP_TEXTURE_ENHANCE_PROMPT);
  if (userExtra) parts.push(`User extra instruction: ${userExtra}`);
  return parts.join("\n\n");
}

export function enforceFaceSwapPromptRequirements(prompt: string) {
  const normalized = prompt.trim() || DEFAULT_FACE_SWAP_PROMPT;
  const required = [
    "Hard rule: image 1 is the target canvas; image 2 is face identity only.",
    `Hard rule: ${FACE_SWAP_NOTE}`,
    "Hard rule: preserve image 1 expression, gaze, head angle, glasses, sunglasses, earrings, necklace, hat, and all accessories exactly.",
    "Hard rule: preserve pores, freckles, moles, blemishes, natural skin grain, original skin tone, and realistic facial asymmetry; no beauty smoothing or whitening.",
    "Do not change body, pose, hairstyle, hair color, skin tone, clothing, garment print, accessories, background, lighting, camera, framing, or image 1 composition.",
    "Do not blend two identities; replace facial features cleanly and realistically while preserving original skin tone, expression, accessories, and hair.",
  ];
  const missing = required.filter((line) => !normalized.includes(line));
  return missing.length ? `${normalized}\n\n${missing.join("\n")}` : normalized;
}

export function normalizeFaceSwapCount(value: unknown) {
  const count = Number(value || 1);
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.floor(count), 1), 4);
}

export type FaceSwapApiPayload = {
  sourceUrl: string;
  faceUrl: string;
  aiModel: LingyaModel;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  prompt: string;
  genCount: number;
  textureEnhance?: boolean;
};
