/**
 * AI 图像生成 API
 * 支持 gpt-image-2、Seedream 和 nano-banana 系列
 */

import { normalizeOpenAiCompatibleBaseUrl } from "@/lib/api/url-utils";
import {
  TRYON_CLOTHING_IMAGE_ROLE_RULE,
  TRYON_FIT_RULE,
  TRYON_GARMENT_RULE,
  TRYON_COLOR_RULE,
  TRYON_MATERIAL_RULE,
  TRYON_PHOTOGRAPHY_RULE,
  TRYON_QUALITY,
  TRYON_SKIN_TONE_RULE,
  applyTryOnAudiencePrompt,
  applyTryOnFramePrompt,
  buildTryOnAudiencePrompt,
  buildTryOnBodyProportionPrompt,
  buildTryOnFacePrompt,
  buildTryOnFramePrompt,
  buildTryOnNegativePrompt,
  buildTryOnReferencePrompt,
  enforceTryOnPromptRequirements,
  type TryOnAgeGroup,
  type TryOnGarmentAudience,
} from "@/lib/tryon-prompt";
import { compileImagePromptForModel, type ImagePromptKind } from "@/lib/api/prompt-compiler";
import {
  TRYON_CLOTHING_ROLE_LABELS,
  normalizeTryOnClothingMode,
  normalizeTryOnClothingRole,
  type TryOnClothingMode,
  type TryOnClothingRole,
} from "@/lib/tryon-upload-rules";

const DEFAULT_API_BASE = "https://api.lingyaai.cn/v1";
const DEFAULT_PLATO_API_BASE = "https://api.bltcy.ai/v1";
const CONCISE_TRYON_PROMPT_MODE = true;

export type LingyaModel = "gpt-image-2" | "doubao-seedream-4-5-251128" | "nano-banana-pro" | "nano-banana-2";
export type AspectRatio = "auto" | "1:1" | "9:16" | "16:9" | "4:3" | "3:4" | "2:3" | "3:2" | "4:5" | "5:4" | "21:9";
export type ImageSize = "1K" | "2K" | "4K";

const LINGYA_MODELS: LingyaModel[] = [
  "gpt-image-2",
  "doubao-seedream-4-5-251128",
  "nano-banana-pro",
  "nano-banana-2",
];

const ASPECT_RATIOS: AspectRatio[] = [
  "auto",
  "1:1",
  "9:16",
  "16:9",
  "4:3",
  "3:4",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "21:9",
];

export const CREDIT_COSTS: Record<LingyaModel, Record<ImageSize, number>> = {
  "gpt-image-2":      { "1K": 2, "2K": 3, "4K": 4 },
  "doubao-seedream-4-5-251128": { "1K": 1, "2K": 1, "4K": 2 },
  "nano-banana-pro":   { "1K": 2, "2K": 3, "4K": 4 },
  "nano-banana-2":     { "1K": 1, "2K": 2, "4K": 3 },
};

export function normalizeLingyaModel(value: unknown): LingyaModel {
  return typeof value === "string" && LINGYA_MODELS.includes(value as LingyaModel)
    ? (value as LingyaModel)
    : "gpt-image-2";
}

export function normalizeAspectRatio(value: unknown, fallback: AspectRatio = "3:4"): AspectRatio {
  return typeof value === "string" && ASPECT_RATIOS.includes(value as AspectRatio)
    ? (value as AspectRatio)
    : fallback;
}

export function getCreditCost(model: LingyaModel, size: ImageSize = "1K", aspectRatio?: AspectRatio): number {
  return CREDIT_COSTS[model]?.[normalizeImageSize(model, size, aspectRatio)] ?? 1;
}

export function getSupportedImageSizes(model: LingyaModel, aspectRatio?: AspectRatio): ImageSize[] {
  if (isSeedreamModel(model)) return ["2K", "4K"];
  if (model === "gpt-image-2" && (!aspectRatio || aspectRatio === "auto" || aspectRatio === "1:1")) return ["1K"];
  return ["1K", "2K", "4K"];
}

export function normalizeImageSize(model: LingyaModel, size: ImageSize = "1K", aspectRatio?: AspectRatio): ImageSize {
  const supported = getSupportedImageSizes(model, aspectRatio);
  return supported.includes(size) ? size : supported[supported.length - 1];
}

interface GenerateInput {
  model: LingyaModel;
  prompt: string;
  prompt_kind?: ImagePromptKind;
  aspect_ratio?: AspectRatio;
  image?: string[];
  image_size?: ImageSize;
  search?: boolean;
}

interface GenerateResult {
  url?: string;
  b64_json?: string;
  prompt?: string;
  compiledPrompt?: string;
}

interface BatchTryOnInput {
  model: LingyaModel;
  clothingUrls: string[];
  clothingMode?: TryOnClothingMode;
  clothingRoles?: TryOnClothingRole[];
  garmentAudience?: TryOnGarmentAudience;
  ageGroup?: TryOnAgeGroup;
  modelFaceUrl?: string;
  referenceUrl?: string;
  aspect_ratio?: AspectRatio;
  image_size?: ImageSize;
  style?: string;
  raw_prompt?: string;
}

export async function generateImage(input: GenerateInput, retries = 2): Promise<GenerateResult> {
  const provider = getImageProvider(input.model);
  const apiKey = provider.apiKey;
  if (!apiKey) throw new Error(`${provider.name} API Key 未配置`);
  const apiBase = provider.apiBase;
  const compiledPrompt = compileImagePromptForModel({
    kind: input.prompt_kind,
    model: input.model,
    prompt: input.prompt,
  });

  const body: Record<string, any> = {
    model: input.model,
    prompt: compiledPrompt,
    response_format: "url",
  };

  if (!isSeedreamModel(input.model)) {
    body.aspect_ratio = input.aspect_ratio || "3:4";
  }
  if (input.image && input.image.length > 0) body.image = input.image;
  if (input.image_size && input.model === "gpt-image-2") {
    body.size = resolvePixelSize(input.image_size, input.aspect_ratio || "3:4");
    body.quality = "auto";
  }
  if (input.image_size && isSeedreamModel(input.model)) {
    body.size = normalizeImageSize(input.model, input.image_size, input.aspect_ratio);
    body.watermark = false;
  }
  if (input.image_size && (input.model === "nano-banana-pro" || input.model === "nano-banana-2")) {
    body.image_size = input.image_size;
  }
  if (input.search && (input.model === "nano-banana-pro" || input.model === "nano-banana-2")) {
    body.search = input.search;
  }

  // 日志（不含完整 base64、不含完整 prompt 内容）
  const logBody: Record<string, unknown> = {
    model: body.model,
    aspect_ratio: body.aspect_ratio,
    image_size: body.image_size || body.size,
    quality: body.quality,
    image_count: Array.isArray(body.image) ? body.image.length : 0,
    prompt_length: typeof body.prompt === "string" ? body.prompt.length : 0,
  };
  console.log(`[api:${provider.name}] 请求:`, JSON.stringify(logBody));

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${apiBase}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const resText = await res.text();

      if (!res.ok) {
        console.error(`[api:${provider.name}] 第${attempt}次失败: ${res.status}`, resText.slice(0, 300));
        if (isRetryableStatus(res.status) && attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 5000));
          continue;
        }
        throw new Error(`API 错误 ${res.status}: ${resText.slice(0, 300)}`);
      }

      const json = JSON.parse(resText);
      const hasData = Array.isArray(json.data) && json.data.length > 0;
      console.log(`[api:${provider.name}] 响应: ok=${res.ok}, hasData=${hasData}`);

      if (!json.data || json.data.length === 0) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, attempt * 5000)); continue; }
        throw new Error("多次尝试后仍未返回图片");
      }

      return {
        url: json.data[0].url,
        b64_json: normalizeB64Image(json.data[0].b64_json),
        prompt: input.prompt,
        compiledPrompt,
      };

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (attempt < retries && (msg.includes("fetch") || msg.includes("Internal Error"))) {
        await new Promise(r => setTimeout(r, attempt * 5000));
        continue;
      }
      throw err;
    }
  }

  throw new Error("API 多次重试后失败");
}

export async function batchTryOn(input: BatchTryOnInput): Promise<{ resultUrls: string[]; prompt: string; compiledPrompt: string }> {
  if (!input.clothingUrls.length) {
    throw new Error("缺少服装图片");
  }

  const { prompt } = buildTryOnPrompt({
    clothingCount: input.clothingUrls.length,
    clothingMode: input.clothingMode,
    clothingRoles: input.clothingRoles,
    garmentAudience: input.garmentAudience,
    ageGroup: input.ageGroup,
    aspectRatio: input.aspect_ratio,
    hasModelFace: !!input.modelFaceUrl,
    hasReference: !!input.referenceUrl,
    style: input.style,
  });
  const finalPrompt = prompt;

  const imageInputs = [
    ...input.clothingUrls,
    ...(input.referenceUrl ? [input.referenceUrl] : []),
    ...(input.modelFaceUrl ? [input.modelFaceUrl] : []),
  ];

  const result = await generateImage({
    model: input.model,
    prompt: finalPrompt,
    prompt_kind: "tryon",
    aspect_ratio: input.aspect_ratio || "3:4",
    image: imageInputs,
    image_size: input.image_size,
  });

  const resultUrl = result.url || result.b64_json;
  if (!resultUrl) {
    throw new Error("图片生成接口未返回结果 URL");
  }

  return { resultUrls: [resultUrl], prompt: finalPrompt, compiledPrompt: result.compiledPrompt || finalPrompt };
}

function getImageApiBaseUrl(): string {
  const envValue = process.env.LINGYA_BASE_URL;
  return envValue ? normalizeOpenAiCompatibleBaseUrl(envValue) : DEFAULT_API_BASE;
}

function getPlatoApiBaseUrl(): string {
  const envValue = process.env.PLATO_BASE_URL;
  return envValue ? normalizeOpenAiCompatibleBaseUrl(envValue) : DEFAULT_PLATO_API_BASE;
}

function getImageProvider(model: LingyaModel): { name: string; apiBase: string; apiKey?: string } {
  if (model === "gpt-image-2") {
    return {
      name: "plato",
      apiBase: getPlatoApiBaseUrl(),
      apiKey: process.env.PLATO_API_KEY || process.env.LINGYA_API_KEY,
    };
  }

  return {
    name: "lingya",
    apiBase: getImageApiBaseUrl(),
    apiKey: process.env.LINGYA_API_KEY,
  };
}

function resolvePixelSize(imageSize: ImageSize, aspectRatio: AspectRatio): string {
  if (aspectRatio === "auto") return "auto";

  const ratio = getAspectRatioValue(aspectRatio);
  const targetPixels: Record<ImageSize, number> = {
    "1K": 1024 * 1024,
    "2K": 2048 * 2048,
    "4K": 3840 * 2160,
  };

  return resolveConstrainedPixelSize(ratio, targetPixels[imageSize]);
}

function getAspectRatioValue(aspectRatio: AspectRatio): number {
  const [width, height] = aspectRatio.split(":").map(Number);
  if (!width || !height) return 3 / 4;
  return width / height;
}

function resolveConstrainedPixelSize(ratio: number, targetPixels: number): string {
  const maxEdge = 3840;
  const minPixels = 655_360;
  const maxPixels = 8_294_400;
  const safeRatio = Math.min(Math.max(ratio, 1 / 3), 3);
  const clampedTarget = Math.min(Math.max(targetPixels, minPixels), maxPixels);

  let width = Math.sqrt(clampedTarget * safeRatio);
  let height = width / safeRatio;
  const scale = Math.min(maxEdge / width, maxEdge / height, 1);
  width *= scale;
  height *= scale;

  let roundedWidth = Math.max(16, Math.floor(width / 16) * 16);
  let roundedHeight = Math.max(16, Math.floor(height / 16) * 16);

  while (roundedWidth * roundedHeight > maxPixels || roundedWidth > maxEdge || roundedHeight > maxEdge) {
    roundedWidth = Math.max(16, roundedWidth - 16);
    roundedHeight = Math.max(16, Math.round((roundedWidth / safeRatio) / 16) * 16);
  }

  while (roundedWidth * roundedHeight < minPixels && roundedWidth < maxEdge && roundedHeight < maxEdge) {
    const nextWidth = Math.min(maxEdge, roundedWidth + 16);
    const nextHeight = Math.min(maxEdge, Math.round((nextWidth / safeRatio) / 16) * 16);
    if (nextWidth === roundedWidth && nextHeight === roundedHeight) break;
    roundedWidth = nextWidth;
    roundedHeight = nextHeight;
  }

  return `${roundedWidth}x${roundedHeight}`;
}

function normalizeB64Image(value?: string): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("data:")) return value;
  return `data:image/png;base64,${value}`;
}

function isSeedreamModel(model: LingyaModel): boolean {
  return model.startsWith("doubao-seedream-");
}

function isRetryableStatus(status: number): boolean {
  return status === 500 || status === 502 || status === 503 || status === 504;
}

// ============================================================
// 提示词构建 —— 多图任务必须显式标记每张图的角色
// ============================================================
//
// 图片顺序：
//   图1..图N：服装图
//   图N+1：参考图（可选，提供人物/姿势/背景/光影）
//   图N+2：模特脸（可选，提供最终脸部身份）
//
// 核心理念：先定义图像角色，再定义主目标、保留项、替换项和禁止项。
// 这样可以减少模型把参考图、服装图、脸图混淆的概率。
// ============================================================

export function buildTryOnPrompt(params: {
  clothingCount: number;
  clothingMode?: TryOnClothingMode;
  clothingRoles?: TryOnClothingRole[];
  garmentAudience?: TryOnGarmentAudience;
  ageGroup?: TryOnAgeGroup;
  aspectRatio?: AspectRatio;
  hasModelFace: boolean;
  hasReference: boolean;
  style?: string;
}): { prompt: string; imageRoles: string[] } {
  const imageRoles: string[] = [];
  let prompt = "";
  const clothingMode = normalizeTryOnClothingMode(params.clothingMode || (params.clothingCount > 1 ? "multi" : "single"));
  const normalizedRoles = Array.from({ length: params.clothingCount }, (_, index) => {
    const fallback: TryOnClothingRole = clothingMode === "multi"
      ? index === 0 ? "upper" : index === 1 ? "lower" : "extra"
      : "single";
    return normalizeTryOnClothingRole(params.clothingRoles?.[index], fallback);
  });

  for (let i = 0; i < params.clothingCount; i++) {
    imageRoles.push(TRYON_CLOTHING_ROLE_LABELS[normalizedRoles[i]] || `服装${i + 1}`);
  }
  if (params.hasReference) imageRoles.push("参考图");
  if (params.hasModelFace) imageRoles.push("模特脸");

  const clothingRefs = Array.from({ length: params.clothingCount }, (_, i) => `图${i + 1}`);
  const clothingRoleText = clothingRefs
    .map((ref, index) => `${ref}是${TRYON_CLOTHING_ROLE_LABELS[normalizedRoles[index]] || "服装"}图，只提供衣服本身`)
    .join("，");
  const mainClothingRef = clothingRefs[0];
  const clothingText = clothingMode === "multi"
    ? normalizedRoles.includes("upper") && normalizedRoles.includes("lower")
      ? `${clothingRefs.join("、")}的上装与下装`
      : `${clothingRefs.join("、")}的多件服装`
    : `${mainClothingRef}的单件服装`;
  const outfitAssemblyRule = clothingMode === "multi"
    ? "多件服装必须按各自品类正确穿着：上装只替换上半身衣服，下装只替换下半身衣服，保持层次关系、遮挡关系、腰线衔接和真实垂坠，不要把多件衣服融合成一件新衣服。"
    : `只将${mainClothingRef}这件单件服装应用到对应身体部位，不要额外生成${mainClothingRef}以外的新服装；参考图中原本存在且不与${mainClothingRef}冲突的下装、鞋履和配饰应自然保留，用于维持完整人物构图和真实穿搭关系。`;
  const referenceImageNumber = params.clothingCount + 1;
  const faceImageNumber = params.clothingCount + (params.hasReference ? 2 : 1);

  if (CONCISE_TRYON_PROMPT_MODE) {
    return {
      prompt: buildConciseTryOnPrompt({
        clothingRefs,
        clothingMode,
        clothingRoles: normalizedRoles,
        garmentAudience: params.garmentAudience,
        ageGroup: params.ageGroup,
        aspectRatio: params.aspectRatio,
        hasReference: params.hasReference,
        hasModelFace: params.hasModelFace,
        referenceImageNumber,
        faceImageNumber,
        style: params.style,
      }),
      imageRoles,
    };
  }

  // ---- 核心提示词（显式编号 + 保留/替换约束） ----
  const skinAndQuality = `真实皮肤质感，可见毛孔、自然纹理和轻微瑕疵，不过度磨皮。${TRYON_QUALITY}。`;
  const poseLock = `【最重要】${buildTryOnReferencePrompt(referenceImageNumber)}`;
  const garmentRules = [
    TRYON_CLOTHING_IMAGE_ROLE_RULE,
    buildTryOnAudiencePrompt({
      garmentAudience: params.garmentAudience,
      ageGroup: params.ageGroup,
    }),
    buildTryOnFramePrompt({
      aspectRatio: params.aspectRatio,
      hasReference: params.hasReference,
      referenceImageNumber,
    }),
    TRYON_GARMENT_RULE,
    TRYON_FIT_RULE,
    TRYON_MATERIAL_RULE,
    TRYON_SKIN_TONE_RULE,
    buildTryOnBodyProportionPrompt({
      garmentAudience: params.garmentAudience,
      ageGroup: params.ageGroup,
    }),
    TRYON_COLOR_RULE,
    TRYON_PHOTOGRAPHY_RULE,
  ].join("\n");
  const faceRule = buildTryOnFacePrompt({
    garmentAudience: params.garmentAudience,
    ageGroup: params.ageGroup,
    hasModelFace: params.hasModelFace,
    modelFaceImageNumber: faceImageNumber,
  });
  const negativeRule = buildTryOnNegativePrompt({
    garmentAudience: params.garmentAudience,
    ageGroup: params.ageGroup,
  });

  if (params.hasReference && params.hasModelFace) {
    prompt = [
      `图像角色：${clothingRoleText}，图${referenceImageNumber}是参考图，图${faceImageNumber}是模特脸图。`,
      `任务：将${clothingText}穿在图${referenceImageNumber}参考图中的人物身上，并将人物脸部替换为图${faceImageNumber}的模特脸。`,
      outfitAssemblyRule,
      poseLock,
      faceRule,
      garmentRules,
      skinAndQuality,
      "不要改变参考图场景，不要生成多余人物，不要改变发型以外的主体身份特征。",
      negativeRule,
    ].join("\n");
  } else if (params.hasReference && !params.hasModelFace) {
    prompt = [
      `图像角色：${clothingRoleText}，图${referenceImageNumber}是参考图。`,
      `任务：将${clothingText}穿在图${referenceImageNumber}参考图中的人物身上。`,
      outfitAssemblyRule,
      poseLock,
      garmentRules,
      skinAndQuality,
      "不要改变参考图场景，不要生成多余人物，脸部身份保持不变。",
      negativeRule,
    ].join("\n");
  } else if (!params.hasReference && params.hasModelFace) {
    prompt = [
      `图像角色：${clothingRoleText}，图${faceImageNumber}是模特脸图。`,
      `任务：生成一张时尚换装照片，让人物穿上${clothingText}，脸部身份使用图${faceImageNumber}的模特脸。`,
      outfitAssemblyRule,
      faceRule,
      garmentRules,
      skinAndQuality,
      "姿势自然，光影真实，单人半身或全身构图，不要生成多余人物。",
      negativeRule,
    ].join("\n");
  } else {
    prompt = [
      `图像角色：${clothingRoleText}。`,
      `任务：生成一张时尚换装照片，让一个人物穿上${clothingText}。`,
      outfitAssemblyRule,
      garmentRules,
      skinAndQuality,
      "姿势自然，专业灯光，单人半身或全身构图，不要生成多余人物。",
      negativeRule,
    ].join("\n");
  }

  // 用户风格补充
  if (params.style?.trim()) {
    prompt += ` ${params.style.trim()}`;
  }

  return { prompt, imageRoles };
}

function buildConciseTryOnPrompt(params: {
  clothingRefs: string[];
  clothingMode: TryOnClothingMode;
  clothingRoles: TryOnClothingRole[];
  garmentAudience?: TryOnGarmentAudience;
  ageGroup?: TryOnAgeGroup;
  aspectRatio?: AspectRatio;
  hasReference: boolean;
  hasModelFace: boolean;
  referenceImageNumber: number;
  faceImageNumber: number;
  style?: string;
}) {
  const clothingSource = params.clothingRefs.length === 1
    ? "image 1"
    : `${params.clothingRefs.slice(0, -1).map(toEnglishImageRef).join(", ")} and ${toEnglishImageRef(params.clothingRefs[params.clothingRefs.length - 1])}`;
  const sourceNoun = params.clothingRefs.length === 1 ? "clothing source" : "clothing sources";
  const targetRef = `image ${params.referenceImageNumber}`;
  const faceRef = `image ${params.faceImageNumber}`;
  const lines: string[] = [];

  lines.push(buildConciseRoleLockRule(params));

  if (params.hasReference && params.hasModelFace) {
    lines.push(`Task: use ${clothingSource} only as ${sourceNoun}; replace the outfit on the person in ${targetRef} with the clothing from ${clothingSource}; keep ${targetRef}'s pose/body/background/camera/framing/lighting; use the face from ${faceRef}.`);
  } else if (params.hasReference) {
    lines.push(`Task: use ${clothingSource} only as ${sourceNoun}; replace the outfit on the person in ${targetRef} with the clothing from ${clothingSource}; keep ${targetRef}'s pose/body/background/camera/framing/lighting.`);
  } else if (params.hasModelFace) {
    lines.push(`Task: create a photorealistic single-person fashion photo wearing the clothing from ${clothingSource}; use the face from ${faceRef}.`);
  } else {
    lines.push(`Task: create a photorealistic single-person fashion photo wearing the clothing from ${clothingSource}.`);
  }

  lines.push(buildConciseSourceIsolationRule(params.clothingRefs));
  lines.push(buildConciseClothingRoleRule(params.clothingRefs, params.clothingRoles, params.clothingMode));

  if (params.hasReference) {
    lines.push(`${targetRef} is the target canvas; do not keep ${targetRef}'s original conflicting outfit. Keep non-conflicting shoes/accessories only when they do not cover or change the source clothing.`);
    lines.push(`Body/composition rule: keep ${targetRef}'s body proportions, pose, visible body range, camera angle, framing, lighting, and background. Allow only natural clothing coverage, fabric volume, folds, and occlusion changes.`);
  }

  if (params.hasModelFace) {
    lines.push(`${faceRef} is the final face identity ONLY. Fully replace the target facial identity with ${faceRef}; do not keep target eyes, nose, lips, face shape, or identity; do not blend identities. Adapt ${faceRef} naturally to the target head angle, lighting, expression, and skin texture.`);
  }

  lines.push(buildConcisePriorityRule({
    clothingSource,
    hasReference: params.hasReference,
    hasModelFace: params.hasModelFace,
    targetRef,
    faceRef,
  }));
  lines.push(buildConciseFailureHandlingRule({
    clothingSource,
    hasReference: params.hasReference,
    hasModelFace: params.hasModelFace,
    targetRef,
    faceRef,
  }));
  lines.push("Preserve source clothing type, silhouette, color, pattern/logo/text, fabric texture, length, neckline, sleeves, hem, pockets, buttons, zippers, seams, layers, and visible details.");
  lines.push(buildConciseAudienceRule(params.garmentAudience, params.ageGroup));
  if (params.aspectRatio && params.aspectRatio !== "auto") {
    lines.push(`Output aspect ratio: ${params.aspectRatio}.`);
  }
  lines.push("Natural garment fit and fabric weight; realistic folds, contact shadows, body proportions, hands, and feet. No extra people, no watermark, no added text, no plastic skin, no AI-render look.");

  if (params.style?.trim()) {
    lines.push(`User extra instruction: ${params.style.trim()}`);
  }

  return lines.join("\n");
}

function buildConciseRoleLockRule(params: {
  clothingRefs: string[];
  clothingRoles: TryOnClothingRole[];
  clothingMode: TryOnClothingMode;
  hasReference: boolean;
  hasModelFace: boolean;
  referenceImageNumber: number;
  faceImageNumber: number;
}) {
  const roles = params.clothingRefs.map((ref, index) => {
    const imageRef = toEnglishImageRef(ref);
    if (params.clothingMode === "multi") {
      const role = params.clothingRoles[index];
      if (role === "upper") return `${imageRef} = upper clothing source ONLY`;
      if (role === "lower") return `${imageRef} = lower clothing source ONLY`;
      return `${imageRef} = extra clothing source ONLY`;
    }
    return `${imageRef} = clothing source ONLY`;
  });

  if (params.hasReference) {
    roles.push(`image ${params.referenceImageNumber} = target body / pose / composition / background ONLY`);
  }
  if (params.hasModelFace) {
    roles.push(`image ${params.faceImageNumber} = face identity ONLY`);
  }

  return `Strict role lock: ${roles.join("; ")}. Do not mix roles under any circumstance.`;
}

function buildConcisePriorityRule(params: {
  clothingSource: string;
  hasReference: boolean;
  hasModelFace: boolean;
  targetRef: string;
  faceRef: string;
}) {
  if (params.hasReference && params.hasModelFace) {
    return `Conflict priority: face identity = ${params.faceRef}; clothing = ${params.clothingSource}; body/pose/composition/background = ${params.targetRef}. No blending, no fallback, no reinterpretation.`;
  }

  if (params.hasReference) {
    return `Conflict priority: clothing = ${params.clothingSource}; body/pose/composition/background = ${params.targetRef}. No fallback to the target's original outfit.`;
  }

  if (params.hasModelFace) {
    return `Conflict priority: face identity = ${params.faceRef}; clothing = ${params.clothingSource}. No blending, no fallback, no reinterpretation.`;
  }

  return `Conflict priority: clothing = ${params.clothingSource}. No unrelated outfit redesign.`;
}

function buildConciseFailureHandlingRule(params: {
  clothingSource: string;
  hasReference: boolean;
  hasModelFace: boolean;
  targetRef: string;
  faceRef: string;
}) {
  if (params.hasReference && params.hasModelFace) {
    return `Failure handling: if anything is ambiguous, never fall back to identity from ${params.clothingSource} or ${params.targetRef}; face identity must stay from ${params.faceRef}, clothing accuracy from ${params.clothingSource}, and body/scene from ${params.targetRef}.`;
  }

  if (params.hasReference) {
    return `Failure handling: if anything is ambiguous, never use identity, pose, or scene from ${params.clothingSource}; clothing accuracy from ${params.clothingSource} and body/scene from ${params.targetRef} are mandatory.`;
  }

  if (params.hasModelFace) {
    return `Failure handling: if anything is ambiguous, never use identity from ${params.clothingSource}; face identity must stay from ${params.faceRef} and clothing accuracy from ${params.clothingSource}.`;
  }

  return `Failure handling: if anything is ambiguous, use ${params.clothingSource} only for clothing and generate one neutral photorealistic model.`;
}

function buildConciseSourceIsolationRule(clothingRefs: string[]) {
  const source = clothingRefs.length === 1 ? toEnglishImageRef(clothingRefs[0]) : clothingRefs.map(toEnglishImageRef).join(", ");
  const verb = clothingRefs.length === 1 ? "is" : "are";
  return `Clothing source isolation - HARD: ${source} ${verb} NOT person reference. Even if a human is visible, do NOT reuse identity, face, skin, body shape, pose, lighting, room, outdoor scene, or background; extract ONLY the clothing as standalone product material.`;
}

function buildConciseClothingRoleRule(clothingRefs: string[], roles: TryOnClothingRole[], mode: TryOnClothingMode) {
  if (mode === "multi") {
    const roleLines = clothingRefs.map((ref, index) => {
      const imageRef = toEnglishImageRef(ref);
      const role = roles[index];
      if (role === "upper") return `${imageRef} = upper-body garment`;
      if (role === "lower") return `${imageRef} = lower-body garment`;
      return `${imageRef} = extra clothing item`;
    });
    return `Multi-garment rule: ${roleLines.join("; ")}. Wear each item on its correct body area, keep natural layering, and do not merge them into one new garment.`;
  }

  return "Single-garment rule: apply image 1 to its matching body area. If image 1 is a dress, one-piece, coat, or full outfit, replace all conflicting target garments it covers.";
}

function buildConciseAudienceRule(garmentAudience?: TryOnGarmentAudience, ageGroup?: TryOnAgeGroup) {
  const audience = garmentAudience === "men" ? "male" : "female";
  const group = ageGroup || "adult";

  if (group === "adult") {
    return `Model age/body rule: adult ${audience}; keep natural adult proportions and do not make the person childlike.`;
  }

  if (group === "teen") {
    return `Model age/body rule: teenage ${audience}; keep natural teen proportions and avoid adult, sexualized, or heavy-makeup styling.`;
  }

  const childLabel: Record<TryOnAgeGroup, string> = {
    adult: "adult",
    teen: "teen",
    big_child: "older child",
    middle_child: "middle child",
    small_child: "young child",
    toddler: "toddler",
  };
  const childGender = garmentAudience === "men" ? "boy" : "girl";
  return `Model age/body rule: ${childLabel[group]} ${childGender}; use age-appropriate child proportions. No adult body, sexualized styling, mature pose, or heavy makeup.`;
}

function toEnglishImageRef(value: string) {
  const match = value.match(/\d+/);
  return `image ${match?.[0] || "1"}`;
}
