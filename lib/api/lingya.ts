/**
 * AI 图像生成 API
 * 支持 gpt-image-2、Seedream 和 nano-banana 系列
 */

const DEFAULT_API_BASE = "https://api.lingyaai.cn/v1";

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
  aspect_ratio?: AspectRatio;
  image?: string[];
  image_size?: ImageSize;
  search?: boolean;
}

interface GenerateResult {
  url?: string;
  b64_json?: string;
}

interface BatchTryOnInput {
  model: LingyaModel;
  clothingUrls: string[];
  modelFaceUrl?: string;
  referenceUrl?: string;
  aspect_ratio?: AspectRatio;
  image_size?: ImageSize;
  style?: string;
  raw_prompt?: string;
}

export async function generateImage(input: GenerateInput, retries = 2): Promise<GenerateResult> {
  const apiKey = process.env.LINGYA_API_KEY;
  if (!apiKey) throw new Error("API Key 未配置");
  const apiBase = getImageApiBaseUrl();

  const body: Record<string, any> = {
    model: input.model,
    prompt: input.prompt,
    response_format: "url",
  };

  if (!isSeedreamModel(input.model)) {
    body.aspect_ratio = input.aspect_ratio || "3:4";
  }
  if (input.image && input.image.length > 0) body.image = input.image;
  if (input.image_size && input.model === "gpt-image-2") {
    body.resolution = normalizeImageSize(input.model, input.image_size, input.aspect_ratio);
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

  // 日志（不含完整 base64）
  const logBody = { ...body };
  if (logBody.image) logBody.image = logBody.image.map((img: string) => img.length > 100 ? `[${Math.round(img.length / 1024)}KB]` : img);
  console.log("[api] 请求:", JSON.stringify(logBody));

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(`${apiBase}/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const resText = await res.text();

      if (!res.ok) {
        console.error(`[api] 第${attempt}次失败: ${res.status}`, resText.slice(0, 300));
        if (isRetryableStatus(res.status) && attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 5000));
          continue;
        }
        throw new Error(`API 错误 ${res.status}: ${resText.slice(0, 300)}`);
      }

      const json = JSON.parse(resText);
      console.log("[api] 响应:", JSON.stringify(json).slice(0, 200));

      if (!json.data || json.data.length === 0) {
        if (attempt < retries) { await new Promise(r => setTimeout(r, attempt * 5000)); continue; }
        throw new Error("多次尝试后仍未返回图片");
      }

      return {
        url: json.data[0].url,
        b64_json: normalizeB64Image(json.data[0].b64_json),
      };

    } catch (err: any) {
      if (attempt < retries && (err.message?.includes("fetch") || err.message?.includes("Internal Error"))) {
        await new Promise(r => setTimeout(r, attempt * 5000));
        continue;
      }
      throw err;
    }
  }

  throw new Error("API 多次重试后失败");
}

export async function batchTryOn(input: BatchTryOnInput): Promise<{ resultUrls: string[]; prompt: string }> {
  if (!input.clothingUrls.length) {
    throw new Error("缺少服装图片");
  }

  const { prompt } = buildTryOnPrompt({
    clothingCount: input.clothingUrls.length,
    hasModelFace: !!input.modelFaceUrl,
    hasReference: !!input.referenceUrl,
    style: input.style,
  });
  const finalPrompt = input.raw_prompt?.trim() || prompt;

  const imageInputs = [
    ...input.clothingUrls,
    ...(input.referenceUrl ? [input.referenceUrl] : []),
    ...(input.modelFaceUrl ? [input.modelFaceUrl] : []),
  ];

  const result = await generateImage({
    model: input.model,
    prompt: finalPrompt,
    aspect_ratio: input.aspect_ratio || "3:4",
    image: imageInputs,
    image_size: input.image_size,
  });

  const resultUrl = result.url || result.b64_json;
  if (!resultUrl) {
    throw new Error("图片生成接口未返回结果 URL");
  }

  return { resultUrls: [resultUrl], prompt: finalPrompt };
}

function getImageApiBaseUrl(): string {
  return normalizeOpenAiCompatibleBaseUrl(process.env.LINGYA_BASE_URL || DEFAULT_API_BASE);
}

function normalizeOpenAiCompatibleBaseUrl(value: string): string {
  const baseUrl = value.replace(/\/+$/, "");
  if (!baseUrl) return DEFAULT_API_BASE;
  return baseUrl.endsWith("/v1") ? baseUrl : `${baseUrl}/v1`;
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
  hasModelFace: boolean;
  hasReference: boolean;
  style?: string;
}): { prompt: string; imageRoles: string[] } {
  const imageRoles: string[] = [];
  let prompt = "";

  // 图片角色记录
  for (let i = 0; i < params.clothingCount; i++) imageRoles.push(`服装${i + 1}`);
  if (params.hasReference) imageRoles.push("参考图");
  if (params.hasModelFace) imageRoles.push("模特脸");

  const clothingRefs = Array.from({ length: params.clothingCount }, (_, i) => `图${i + 1}`);
  const clothingText = params.clothingCount > 1
    ? `${clothingRefs.join("、")}的服装搭配成一套完整穿搭`
    : "图1的衣服";
  const referenceImageNumber = params.clothingCount + 1;
  const faceImageNumber = params.clothingCount + (params.hasReference ? 2 : 1);

  // ---- 核心提示词（显式编号 + 保留/替换约束） ----
  const skinAndQuality = "真实皮肤质感，可见毛孔、自然纹理和轻微瑕疵，不过度磨皮。photorealistic, 8K ultra-detailed, high contrast, cinematic color grade, commercial fashion catalog quality, sharp details, raw photo quality。";

  if (params.hasReference && params.hasModelFace) {
    prompt = `图像角色：${clothingRefs.join("、")}是服装图，图${referenceImageNumber}是参考图，图${faceImageNumber}是模特脸图。任务：将${clothingText}穿在图${referenceImageNumber}参考图中的人物身上，并将人物脸部替换为图${faceImageNumber}的模特脸。严格保持图${referenceImageNumber}的背景、构图、镜头角度、光影、姿势、身体比例和人物位置不变。保留服装的版型、颜色、材质、图案和细节，使服装自然贴合人体。${skinAndQuality}不要改变参考图场景，不要生成多余人物，不要改变发型以外的主体身份特征。`;
  } else if (params.hasReference && !params.hasModelFace) {
    prompt = `图像角色：${clothingRefs.join("、")}是服装图，图${referenceImageNumber}是参考图。任务：将${clothingText}穿在图${referenceImageNumber}参考图中的人物身上。严格保持图${referenceImageNumber}的背景、构图、镜头角度、光影、姿势、身体比例、人物位置和脸部身份不变。保留服装的版型、颜色、材质、图案和细节，使服装自然贴合人体。${skinAndQuality}不要改变参考图场景，不要生成多余人物。`;
  } else if (!params.hasReference && params.hasModelFace) {
    prompt = `图像角色：${clothingRefs.join("、")}是服装图，图${faceImageNumber}是模特脸图。任务：生成一张时尚换装照片，让人物穿上${clothingText}，脸部身份使用图${faceImageNumber}的模特脸。保留服装的版型、颜色、材质、图案和细节，使服装自然贴合人体。${skinAndQuality}姿势自然，光影真实，单人半身或全身构图，不要生成多余人物。`;
  } else {
    prompt = `图像角色：${clothingRefs.join("、")}是服装图。任务：生成一张时尚换装照片，让一个人物穿上${clothingText}。保留服装的版型、颜色、材质、图案和细节，使服装自然贴合人体。${skinAndQuality}姿势自然，专业灯光，单人半身或全身构图，不要生成多余人物。`;
  }

  // 用户风格补充
  if (params.style?.trim()) {
    prompt += ` ${params.style.trim()}`;
  }

  return { prompt, imageRoles };
}
