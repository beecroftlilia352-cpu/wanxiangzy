import type { AspectRatio, ImageSize, LingyaModel } from "@/lib/api/lingya";

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

export const FACE_SWAP_SAMPLE_IMAGES: FaceSwapSampleImage[] = [
  {
    id: 9,
    url: "https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/demo_009.jpg",
    width: 1600,
    height: 2400,
  },
  {
    id: 10,
    url: "https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/demo_010.jpg",
    width: 3942,
    height: 3942,
  },
  {
    id: 11,
    url: "https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/demo_011.jpg",
    width: 2500,
    height: 2500,
  },
  {
    id: 12,
    url: "https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/demo_012.jpg",
    width: 1800,
    height: 2400,
  },
];

const FEMALE_FACE_SORTS = [1, 2, 3, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 21, 22, 23, 24, 25];
const MALE_FACE_SORTS = Array.from({ length: 20 }, (_, index) => index + 1);

export const FACE_SWAP_LIBRARY: FaceSwapLibraryItem[] = [
  ...FEMALE_FACE_SORTS.map((sort, index) => ({
    id: 691 + index,
    gender: "female" as const,
    sort,
    url: `https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/官方模特/官方女模特/text_${String(sort).padStart(5, "0")}_.png`,
  })),
  ...MALE_FACE_SORTS.map((sort, index) => ({
    id: 710 + index,
    gender: "male" as const,
    sort: 100 + sort,
    url: `https://zhiyi-image.oss-cn-hangzhou.aliyuncs.com/devops/comfyui/input/demo/官方模特/官方男模特/text_${String(sort).padStart(5, "0")}_.png`,
  })),
];

export const FACE_SWAP_NOTE =
  "Swap Face only changes facial features. It does not change the model's skin tone or hairstyle.";

export const DEFAULT_FACE_SWAP_PROMPT = [
  "Image 1 is the original model photo and the target canvas. Image 2 is the target face identity reference.",
  "Replace only the facial features of the person in image 1 with the face identity from image 2.",
  "Keep image 1 unchanged for body, pose, hairstyle, hair color, skin tone, neck, body proportions, clothing, accessories, background, camera angle, framing, lighting, and commercial photography quality.",
  FACE_SWAP_NOTE,
  "Use image 2 only for facial identity: eyes, eyebrows, nose, lips, face structure, facial expression character, and recognizable identity. Adapt the new face naturally to image 1 head angle, expression, lighting, shadows, skin texture, and photo quality.",
  "The transition around forehead, jawline, ears, neck, and hairline must be seamless and realistic. Preserve the original model skin tone and do not whiten, tan, beautify, age-shift, change makeup style, change hairstyle, or change clothing.",
  "Output a photorealistic fashion image with clean facial detail, natural pores, no face distortion, no extra people, no watermark, no AI-render look.",
].join("\n");

export function buildFaceSwapPrompt(extra?: string) {
  const userExtra = typeof extra === "string" ? extra.trim() : "";
  if (!userExtra) return DEFAULT_FACE_SWAP_PROMPT;
  return `${DEFAULT_FACE_SWAP_PROMPT}\n\nUser extra instruction: ${userExtra}`;
}

export function enforceFaceSwapPromptRequirements(prompt: string) {
  const normalized = prompt.trim() || DEFAULT_FACE_SWAP_PROMPT;
  const required = [
    "Hard rule: image 1 is the target canvas; image 2 is face identity only.",
    `Hard rule: ${FACE_SWAP_NOTE}`,
    "Do not change body, pose, hairstyle, hair color, skin tone, clothing, accessories, background, lighting, camera, framing, or image 1 composition.",
    "Do not blend two identities; replace facial features cleanly and realistically while preserving original skin tone and hair.",
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
};
