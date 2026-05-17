/**
 * AI 图像生成 API
 * 支持 gpt-image-2 和 nano-banana 系列
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
  buildTryOnGarmentCategoryPrompt,
  buildTryOnNegativePrompt,
  buildTryOnReferencePrompt,
  enforceTryOnPromptRequirements,
  type TryOnAgeGroup,
  type TryOnGarmentCategory,
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
const DEFAULT_PLATO_API_BASE = "https://yunwu.ai/v1";
const DEFAULT_LAOZHANG_API_BASE = "https://api.laozhang.ai";
const DEFAULT_GPT_IMAGE_2_PROVIDER_MODEL = "gpt-image-2";
const DEFAULT_NANO_BANANA_PROVIDER_MODEL = "gemini-3.1-flash-image-preview";
const DEFAULT_NANO_BANANA_PRO_PROVIDER_MODEL = "gemini-3-pro-image-preview";
const CONCISE_TRYON_PROMPT_MODE = true;
const IMAGE_REQUEST_PROGRESS_INITIAL = 2;
const IMAGE_REQUEST_PROGRESS_INTERVAL_MS = 8000;
const IMAGE_REQUEST_PROGRESS_CURVE_MS = 90_000;
const SYNC_IMAGE_REQUEST_PROGRESS_MAX = 92;
const ASYNC_IMAGE_SUBMIT_PROGRESS_MAX = 8;

export type LingyaModel = "gpt-image-2" | "nano-banana-pro" | "nano-banana-2";
export type AspectRatio = "auto" | "1:1" | "9:16" | "16:9" | "4:3" | "3:4" | "2:3" | "3:2" | "4:5" | "5:4" | "21:9";
export type ImageSize = "1K" | "2K" | "4K";
export const DEFAULT_LINGYA_MODEL: LingyaModel = "nano-banana-2";

const LINGYA_MODELS: LingyaModel[] = [
  "nano-banana-2",
  "gpt-image-2",
  "nano-banana-pro",
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
  "nano-banana-pro":   { "1K": 2, "2K": 3, "4K": 4 },
  "nano-banana-2":     { "1K": 1, "2K": 2, "4K": 3 },
};

export function normalizeLingyaModel(value: unknown): LingyaModel {
  return typeof value === "string" && LINGYA_MODELS.includes(value as LingyaModel)
    ? (value as LingyaModel)
    : DEFAULT_LINGYA_MODEL;
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
  onProgress?: (update: ImageTaskProgress) => Promise<void> | void;
}

interface GenerateResult {
  url?: string;
  b64_json?: string;
  prompt?: string;
  compiledPrompt?: string;
  taskId?: string;
}

export type ImageTaskProgress = {
  taskId?: string;
  status: "queued" | "running" | "completed" | "failed";
  providerStatus?: string;
  progress: number;
  urls?: string[];
  error?: string;
};

interface BatchTryOnInput {
  model: LingyaModel;
  clothingUrls: string[];
  clothingMode?: TryOnClothingMode;
  clothingRoles?: TryOnClothingRole[];
  garmentAudience?: TryOnGarmentAudience;
  ageGroup?: TryOnAgeGroup;
  garmentCategory?: TryOnGarmentCategory;
  modelFaceUrl?: string;
  referenceUrl?: string;
  aspect_ratio?: AspectRatio;
  image_size?: ImageSize;
  style?: string;
  raw_prompt?: string;
  onProgress?: (update: ImageTaskProgress) => Promise<void> | void;
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

  const useLaozhangNativeEndpoint = shouldUseLaozhangNativeEndpoint(input, provider);
  const useImageEditEndpoint = !useLaozhangNativeEndpoint && shouldUseImageEditEndpoint(input, provider);
  const body = buildGenerateRequestBody(input, compiledPrompt);
  body.model = resolveProviderImageModel(input.model, provider);

  // 日志（不含完整 base64、不含完整 prompt 内容）
  const logBody: Record<string, unknown> = {
    model: body.model,
    endpoint: useLaozhangNativeEndpoint ? "generateContent" : useImageEditEndpoint ? "images/edits" : "images/generations",
    aspect_ratio: body.aspect_ratio,
    image_size: body.image_size || body.size,
    quality: body.quality,
    image_count: Array.isArray(input.image) ? input.image.length : 0,
    prompt_length: typeof body.prompt === "string" ? body.prompt.length : 0,
  };
  console.log(`[api:${provider.name}] 请求:`, JSON.stringify(logBody));

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const isAsyncSubmit = !useLaozhangNativeEndpoint && !useImageEditEndpoint && shouldRequestAsyncImageTask(provider);
      await input.onProgress?.({ status: "queued", providerStatus: "REQUEST_QUEUED", progress: 1 });
      let res: Response;
      let resText: string;
      const stopRequestHeartbeat = startImageRequestProgressHeartbeat(input.onProgress, {
        maxProgress: isAsyncSubmit ? ASYNC_IMAGE_SUBMIT_PROGRESS_MAX : SYNC_IMAGE_REQUEST_PROGRESS_MAX,
        providerStatus: isAsyncSubmit ? "SUBMITTING" : "GENERATING",
      });
      try {
        const request = useLaozhangNativeEndpoint
          ? await buildLaozhangNativeImageRequest({
              apiBase,
              apiKey,
              model: String(body.model),
              prompt: compiledPrompt,
              imageUrls: input.image || [],
              aspectRatio: input.aspect_ratio,
              imageSize: input.image_size,
            })
          : useImageEditEndpoint
            ? await buildImageEditRequest({ apiBase, apiKey, body, imageUrls: input.image || [] })
            : buildImageGenerationRequest({ apiBase, apiKey, provider, body });
        res = await fetch(request.url, request.init);

        resText = await res.text();
      } finally {
        stopRequestHeartbeat();
      }

      if (!res.ok) {
        console.error(`[api:${provider.name}] 第${attempt}次失败: ${res.status}`, resText.slice(0, 300));
        if (isRetryableStatus(res.status) && attempt < retries) {
          await new Promise(r => setTimeout(r, attempt * 5000));
          continue;
        }
        throw new Error(`API 错误 ${res.status}: ${resText.slice(0, 300)}`);
      }

      const json = JSON.parse(resText);
      const taskId = extractTaskId(json);
      const immediateResult = extractGeneratedImages(json);
      console.log(`[api:${provider.name}] 生成响应: ok=${res.ok}, async=${shouldRequestAsyncImageTask(provider)}, hasTask=${Boolean(taskId)}, imageCount=${immediateResult.urls.length + (immediateResult.b64Json ? 1 : 0)}`);

      if (!taskId) {
        if (immediateResult.urls.length || immediateResult.b64Json) {
          await input.onProgress?.({
            status: "completed",
            providerStatus: "SYNC_COMPLETED",
            progress: 100,
            urls: immediateResult.urls,
          });
          return {
            url: immediateResult.urls[0],
            b64_json: normalizeB64Image(immediateResult.b64Json),
            prompt: input.prompt,
            compiledPrompt,
          };
        }
        if (attempt < retries) { await new Promise(r => setTimeout(r, attempt * 5000)); continue; }
        throw new Error(`图片生成接口未返回任务 ID 或图片结果，响应字段: ${describeResponseKeys(json)}`);
      }

      await input.onProgress?.({ taskId, status: "queued", providerStatus: "SUBMITTED", progress: 1 });
      const completed = await pollImageTask({
        provider,
        apiBase,
        apiKey,
        taskId,
        onProgress: input.onProgress,
      });

      return {
        url: completed.urls[0],
        b64_json: normalizeB64Image(completed.b64Json),
        prompt: input.prompt,
        compiledPrompt,
        taskId,
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

function startImageRequestProgressHeartbeat(
  onProgress: GenerateInput["onProgress"],
  options: { maxProgress: number; providerStatus: string }
) {
  if (!onProgress) return () => {};

  const startedAt = Date.now();
  let stopped = false;
  let lastProgress = 1;
  let pending: Promise<void> = Promise.resolve();

  const emit = (progress: number) => {
    if (stopped) return;
    const nextProgress = Math.max(lastProgress, progress);
    if (nextProgress === lastProgress) return;
    lastProgress = nextProgress;
    pending = pending
      .then(async () => {
        if (stopped) return;
        await onProgress({
          status: "running",
          providerStatus: options.providerStatus,
          progress: nextProgress,
        });
      })
      .catch(() => {});
  };

  emit(IMAGE_REQUEST_PROGRESS_INITIAL);
  const timer = setInterval(() => {
    emit(calculateImageRequestHeartbeatProgress(Date.now() - startedAt, lastProgress, options.maxProgress));
  }, IMAGE_REQUEST_PROGRESS_INTERVAL_MS);

  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

function calculateImageRequestHeartbeatProgress(elapsedMs: number, previousProgress: number, maxProgress: number) {
  const safeMax = Math.min(99, Math.max(IMAGE_REQUEST_PROGRESS_INITIAL, Math.round(maxProgress)));
  const safePrevious = Math.min(safeMax, Math.max(0, Math.round(previousProgress)));
  const elapsed = Math.max(0, elapsedMs);
  const eased = 1 - Math.exp(-elapsed / IMAGE_REQUEST_PROGRESS_CURVE_MS);
  const target = Math.round(IMAGE_REQUEST_PROGRESS_INITIAL + (safeMax - IMAGE_REQUEST_PROGRESS_INITIAL) * eased);
  const stepped = safePrevious < safeMax ? safePrevious + 1 : safePrevious;
  return Math.min(safeMax, Math.max(safePrevious, stepped, target));
}

export async function batchTryOn(input: BatchTryOnInput): Promise<{ resultUrls: string[]; prompt: string; compiledPrompt: string; taskId?: string }> {
  if (!input.clothingUrls.length) {
    throw new Error("缺少服装图片");
  }

  const { prompt } = buildTryOnPrompt({
    clothingCount: input.clothingUrls.length,
    clothingMode: input.clothingMode,
    clothingRoles: input.clothingRoles,
    garmentAudience: input.garmentAudience,
    ageGroup: input.ageGroup,
    garmentCategory: input.garmentCategory,
    aspectRatio: input.aspect_ratio,
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
    prompt_kind: "tryon",
    aspect_ratio: input.aspect_ratio || "3:4",
    image: imageInputs,
    image_size: input.image_size,
    onProgress: input.onProgress,
  });

  const resultUrl = result.url || result.b64_json;
  if (!resultUrl) {
    throw new Error("图片生成接口未返回结果 URL");
  }

  return { resultUrls: [resultUrl], prompt: finalPrompt, compiledPrompt: result.compiledPrompt || finalPrompt, taskId: result.taskId };
}

function buildGenerateRequestBody(input: GenerateInput, compiledPrompt: string): Record<string, any> {
  const body: Record<string, any> = {
    model: input.model,
    prompt: compiledPrompt,
  };

  if (input.model !== "gpt-image-2") {
    body.response_format = "url";
  }
  if (!isSeedreamModel(input.model) && input.model !== "gpt-image-2") {
    body.aspect_ratio = input.aspect_ratio || "3:4";
  }
  if (input.image && input.image.length > 0 && input.model !== "gpt-image-2") body.image = input.image;
  if (input.model === "gpt-image-2") {
    // gpt-image-2 只接受标准尺寸，不接受自定义像素值或 aspect_ratio
    body.size = input.image_size ? resolveGptImage2Size(input.aspect_ratio || "3:4") : "auto";
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

  return body;
}

function shouldUseImageEditEndpoint(input: Pick<GenerateInput, "model" | "image">, provider: { name: string }): boolean {
  return provider.name === "plato" && input.model === "gpt-image-2" && Boolean(input.image?.length);
}

function shouldUseLaozhangNativeEndpoint(input: Pick<GenerateInput, "model">, provider: { name: string }): boolean {
  return provider.name === "laozhang" && isNanoBananaModel(input.model);
}

function buildImageGenerationRequest(params: {
  apiBase: string;
  apiKey: string;
  provider: { name: string };
  body: Record<string, any>;
}): { url: string; init: RequestInit } {
  return {
    url: getImageGenerationUrl(params.apiBase, params.provider),
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${params.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(params.body),
    },
  };
}

async function buildLaozhangNativeImageRequest(params: {
  apiBase: string;
  apiKey: string;
  model: string;
  prompt: string;
  imageUrls: string[];
  aspectRatio?: AspectRatio;
  imageSize?: ImageSize;
}): Promise<{ url: string; init: RequestInit }> {
  const imageParts = await Promise.all(params.imageUrls.map(fetchImageInlineDataPart));
  const parts = [
    { text: params.prompt },
    ...imageParts,
  ];

  return {
    url: getLaozhangGenerateContentUrl(params.apiBase, params.model),
    init: {
      method: "POST",
      headers: { "x-goog-api-key": params.apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: {
            aspectRatio: normalizeLaozhangAspectRatio(params.aspectRatio),
            imageSize: params.imageSize || "1K",
          },
        },
      }),
    },
  };
}

async function fetchImageInlineDataPart(src: string, index: number): Promise<{ inline_data: { mime_type: string; data: string } }> {
  const image = await fetchImageFormPart(src, index);
  const bytes = await image.blob.arrayBuffer();
  return {
    inline_data: {
      mime_type: image.blob.type || "image/png",
      data: Buffer.from(bytes).toString("base64"),
    },
  };
}

async function buildImageEditRequest(params: {
  apiBase: string;
  apiKey: string;
  body: Record<string, any>;
  imageUrls: string[];
}): Promise<{ url: string; init: RequestInit }> {
  if (!params.imageUrls.length) {
    throw new Error("gpt-image-2 image edit requires at least one reference image");
  }

  const form = new FormData();
  for (const [key, value] of Object.entries(params.body)) {
    if (key === "image" || key === "response_format" || value === undefined || value === null) continue;
    form.append(key, String(value));
  }
  if (!Object.prototype.hasOwnProperty.call(params.body, "n")) {
    form.append("n", "1");
  }

  const images = await Promise.all(params.imageUrls.map(fetchImageFormPart));
  for (const image of images) {
    form.append("image", image.blob, image.filename);
  }

  return {
    url: getImageEditUrl(params.apiBase),
    init: {
      method: "POST",
      headers: { Authorization: `Bearer ${params.apiKey}`, Accept: "application/json" },
      body: form,
    },
  };
}

async function fetchImageFormPart(src: string, index: number): Promise<{ blob: Blob; filename: string }> {
  const imageUrl = typeof src === "string" ? src.trim() : "";
  if (!imageUrl) throw new Error("Missing reference image");
  if (!/^https?:\/\//i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) {
    throw new Error("gpt-image-2 image edit requires public image URLs or data image URLs");
  }

  let res: Response;
  try {
    res = await fetch(imageUrl);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to download reference image: ${message}`);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Failed to download reference image ${res.status}: ${detail.slice(0, 200)}`);
  }

  const responseMimeType = normalizeImageMimeType(res.headers.get("content-type"));
  const inferredMimeType = inferImageMimeType(imageUrl);
  const mimeType = isSupportedEditImageMime(responseMimeType) ? responseMimeType : inferredMimeType;
  if (!mimeType) {
    throw new Error(`Unsupported reference image type: ${responseMimeType || "unknown"}`);
  }

  const bytes = await res.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new Error("Reference image is empty");
  }

  return {
    blob: new Blob([bytes], { type: mimeType }),
    filename: buildImageFilename(imageUrl, index, mimeType),
  };
}

async function pollImageTask(params: {
  provider: { name: string };
  apiBase: string;
  apiKey: string;
  taskId: string;
  onProgress?: GenerateInput["onProgress"];
}): Promise<{ urls: string[]; b64Json?: string }> {
  const startedAt = Date.now();
  const timeoutMs = getImageTaskTimeoutMs();
  const resultGraceMs = getImageTaskResultGraceMs();
  let lastProgress = 1;
  let completedWithoutResultAt: number | null = null;
  let lastResultlessSummary = "";
  let lastResultlessProviderStatus = "";
  let transientQueryErrors = 0;
  let lastTransientQueryError = "";
  const transientQueryErrorLimit = getImageTaskPollErrorRetryLimit();

  while (Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, getImageTaskPollIntervalMs()));
    const res = await fetch(`${params.apiBase}/images/tasks/${encodeURIComponent(params.taskId)}`, {
      headers: { Authorization: `Bearer ${params.apiKey}` },
    });
    const resText = await res.text();
    if (!res.ok) {
      const message = `任务查询失败 ${res.status}: ${resText.slice(0, 300)}`;
      if (isRetryableStatus(res.status) && transientQueryErrors < transientQueryErrorLimit) {
        transientQueryErrors += 1;
        lastTransientQueryError = message;
        await params.onProgress?.({
          taskId: params.taskId,
          status: "running",
          providerStatus: `QUERY_${res.status}`,
          progress: lastProgress,
          urls: [],
          error: message,
        });
        continue;
      }
      throw new Error(message);
    }
    transientQueryErrors = 0;
    lastTransientQueryError = "";
    const json = JSON.parse(resText);
    const task = normalizeImageTaskResponse(json, params.taskId);
    const progress = Math.max(lastProgress, task.progress);
    lastProgress = progress;
    const providerDoneWithoutResult = isImageTaskDoneStatus(task.providerStatus) && !task.urls.length && !task.b64Json;
    if (providerDoneWithoutResult) {
      completedWithoutResultAt ??= Date.now();
      lastResultlessSummary = describeResponseKeys(json);
      lastResultlessProviderStatus = task.providerStatus || "";
    } else {
      completedWithoutResultAt = null;
    }

    await params.onProgress?.({
      taskId: params.taskId,
      status: task.status,
      providerStatus: task.providerStatus,
      progress,
      urls: task.urls,
      error: task.error,
    });

    if (task.status === "completed") {
      return { urls: task.urls, b64Json: task.b64Json };
    }
    if (task.status === "failed") {
      throw new Error(task.error || "异步图片任务失败");
    }
    if (completedWithoutResultAt && Date.now() - completedWithoutResultAt >= resultGraceMs) {
      throw new Error(
        `异步图片任务已完成但结果 URL 未就绪，任务 ${params.taskId}，状态 ${lastResultlessProviderStatus || "-"}，响应字段: ${lastResultlessSummary || "unknown"}`
      );
    }
  }

  throw new Error(lastTransientQueryError ? `异步图片任务超时，最后一次查询错误：${lastTransientQueryError}` : "异步图片任务超时");
}

function normalizeImageTaskResponse(json: any, fallbackTaskId: string): {
  taskId: string;
  status: ImageTaskProgress["status"];
  providerStatus?: string;
  progress: number;
  urls: string[];
  b64Json?: string;
  error?: string;
} {
  const root = json?.data && !Array.isArray(json.data) ? json.data : json;
  const providerStatus = String(root?.status || json?.status || "").toUpperCase();
  const progress = parseProgress(root?.progress ?? json?.progress);
  const generatedImages = extractGeneratedImages(root);
  const urls = generatedImages.urls;
  const b64Json = normalizeB64Image(generatedImages.b64Json);
  const failReason = root?.fail_reason || root?.error || root?.message || json?.message;

  if (isImageTaskFailedStatus(providerStatus)) {
    return { taskId: root?.task_id || root?.taskId || root?.id || fallbackTaskId, status: "failed", providerStatus, progress, urls, b64Json, error: String(failReason || "生成失败") };
  }
  if (urls.length > 0 || b64Json) {
    return { taskId: root?.task_id || root?.taskId || root?.id || fallbackTaskId, status: "completed", providerStatus, progress: 100, urls, b64Json };
  }
  if (isImageTaskDoneStatus(providerStatus)) {
    return { taskId: root?.task_id || root?.taskId || root?.id || fallbackTaskId, status: "running", providerStatus, progress: 99, urls, b64Json };
  }
  return {
    taskId: root?.task_id || root?.taskId || root?.id || fallbackTaskId,
    status: isImageTaskQueuedStatus(providerStatus) ? "queued" : "running",
    providerStatus,
    progress,
    urls,
    b64Json,
  };
}

function extractTaskId(json: any): string {
  const candidates = [
    json?.task_id,
    json?.taskId,
    json?.task?.task_id,
    json?.task?.id,
    json?.data?.task_id,
    json?.data?.taskId,
    json?.data?.task?.task_id,
    json?.data?.task?.id,
    json?.result?.task_id,
    json?.result?.taskId,
    json?.output?.task_id,
    json?.output?.taskId,
    json?.request_id,
    json?.data?.request_id,
    Array.isArray(json?.data) ? json.data[0]?.task_id : undefined,
    Array.isArray(json?.data) ? json.data[0]?.taskId : undefined,
    Array.isArray(json?.data) ? json.data[0]?.id : undefined,
  ];
  const explicit = candidates.find((value) => (typeof value === "string" && value.trim()) || (typeof value === "number" && Number.isFinite(value)));
  if (typeof explicit === "number") return String(explicit);
  if (typeof explicit === "string") return explicit.trim();

  const statusLike = json?.status || json?.data?.status || json?.progress || json?.data?.progress;
  const ambiguousId = json?.id || json?.data?.id;
  if (!statusLike) return "";
  if (typeof ambiguousId === "number" && Number.isFinite(ambiguousId)) return String(ambiguousId);
  return typeof ambiguousId === "string" ? ambiguousId.trim() : "";
}

const IMAGE_URL_FIELDS = [
  "url",
  "image_url",
  "imageUrl",
  "imageURL",
  "result_url",
  "resultUrl",
  "asset_url",
  "assetUrl",
  "src",
  "file_url",
  "fileUrl",
  "download_url",
  "downloadUrl",
  "public_url",
  "publicUrl",
  "media_url",
  "mediaUrl",
  "output_url",
  "outputUrl",
  "signed_url",
  "signedUrl",
  "uri",
  "href",
  "link",
  "location",
  "image",
  "result",
  "output",
  "asset",
  "file",
  "media",
] as const;

const IMAGE_BASE64_FIELDS = [
  "b64_json",
  "b64Json",
  "base64",
  "base64_image",
  "base64Image",
  "image_base64",
  "imageBase64",
] as const;

function extractGeneratedImages(root: any): { urls: string[]; b64Json?: string } {
  const imageItems = extractImageItems(root);
  const urls = imageItems
    .flatMap(extractImageUrls)
    .filter(isImageUrl);
  const b64Json = imageItems
    .map(extractImageBase64)
    .find(Boolean);
  return { urls: Array.from(new Set(urls)), b64Json };
}

function extractImageItems(root: any): any[] {
  if (!root) return [];
  if (typeof root === "string") return isImageUrl(root) ? [{ url: root }] : [];
  if (Array.isArray(root)) {
    if (root.every((item) => typeof item === "string")) return root.map((url) => ({ url }));
    return root;
  }
  if (hasKnownImageResultField(root)) {
    return [root];
  }

  const candidates = [
    root?.data?.data,
    root?.data,
    root?.data?.images,
    root?.data?.image,
    root?.data?.urls,
    root?.data?.url,
    root?.data?.result_urls,
    root?.data?.result,
    root?.data?.output,
    root?.data?.outputs,
    root?.data?.artifacts,
    root?.data?.files,
    Array.isArray(root?.candidates) ? root.candidates.flatMap((candidate: any) => candidate?.content?.parts || []) : undefined,
    root?.content?.parts,
    root?.output?.images,
    root?.output?.image,
    root?.output?.data,
    root?.output?.urls,
    root?.output?.url,
    root?.output?.results,
    root?.output?.artifacts,
    root?.output?.files,
    root?.output,
    root?.outputs,
    root?.output_images,
    root?.result?.images,
    root?.result?.image,
    root?.result?.data,
    root?.result?.urls,
    root?.result?.url,
    root?.result?.outputs,
    root?.result?.artifacts,
    root?.result?.files,
    root?.result,
    root?.results,
    root?.images,
    root?.image,
    root?.artifacts,
    root?.files,
    root?.items,
    root?.assets,
    root?.resources,
    root?.result_urls,
    root?.urls,
    root?.image_url,
    root?.result_url,
    root?.file_url,
    root?.download_url,
  ];
  for (const candidate of candidates) {
    const items = extractImageItems(candidate);
    if (items.length) return items;
  }
  return collectImageItemsFromOutputContainers(root);
}

function extractImageUrls(item: any): string[] {
  if (typeof item === "string") return [item];
  if (!item || typeof item !== "object") return [];
  const urls: string[] = [];
  for (const field of IMAGE_URL_FIELDS) {
    const value = item[field];
    if (typeof value === "string" && value.trim()) {
      urls.push(value.trim());
      continue;
    }
    urls.push(...extractGeneratedImages(value).urls);
  }
  return urls;
}

function extractImageBase64(item: any): string | undefined {
  if (!item || typeof item !== "object") return undefined;
  const inlineData = item.inlineData || item.inline_data;
  if (inlineData && typeof inlineData === "object" && typeof inlineData.data === "string" && inlineData.data.trim()) {
    const mimeType = normalizeImageMimeType(inlineData.mimeType || inlineData.mime_type) || "image/png";
    return `data:${mimeType};base64,${inlineData.data.trim()}`;
  }
  for (const field of IMAGE_BASE64_FIELDS) {
    const value = item[field];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function isImageUrl(value: unknown): value is string {
  return typeof value === "string" && (/^https?:\/\//i.test(value) || /^data:image\//i.test(value));
}

function hasKnownImageResultField(value: any): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return IMAGE_URL_FIELDS.some((field) => value[field])
    || IMAGE_BASE64_FIELDS.some((field) => value[field])
    || Boolean(value.inlineData?.data || value.inline_data?.data);
}

function collectImageItemsFromOutputContainers(value: any, depth = 0, seen = new WeakSet<object>()): any[] {
  if (!value || depth > 6) return [];
  if (typeof value === "string") return isImageUrl(value) ? [{ url: value }] : [];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectImageItemsFromOutputContainers(item, depth + 1, seen));
  }
  if (typeof value !== "object") return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (hasKnownImageResultField(value)) return [value];

  const items: any[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (shouldSkipImageScanKey(key)) continue;
    if (isLikelyImageResultContainerKey(key)) {
      items.push(...collectImageItemsFromOutputContainers(child, depth + 1, seen));
    }
  }
  return items;
}

function shouldSkipImageScanKey(key: string): boolean {
  const normalized = key.toLowerCase();
  return /input|source|reference|prompt|request|origin|mask|init/.test(normalized);
}

function isLikelyImageResultContainerKey(key: string): boolean {
  const normalized = key.replace(/[_-]/g, "").toLowerCase();
  return [
    "data",
    "output",
    "outputs",
    "result",
    "results",
    "response",
    "images",
    "image",
    "generatedimages",
    "resultimages",
    "artifacts",
    "artifact",
    "files",
    "file",
    "items",
    "item",
    "resources",
    "assets",
    "media",
    "urls",
    "url",
    "links",
  ].includes(normalized)
    || normalized.includes("image")
    || normalized.includes("result")
    || normalized.includes("output")
    || normalized.includes("artifact")
    || normalized.includes("file")
    || normalized.includes("url")
    || normalized.includes("media");
}

function describeResponseKeys(value: any): string {
  if (!value || typeof value !== "object") return typeof value;
  const topKeys = Object.keys(value).slice(0, 12);
  const dataKeys = value.data && typeof value.data === "object" && !Array.isArray(value.data)
    ? Object.keys(value.data).slice(0, 12)
    : [];
  const firstDataKeys = Array.isArray(value.data) && value.data[0] && typeof value.data[0] === "object"
    ? Object.keys(value.data[0]).slice(0, 12)
    : [];
  return [
    `top=${topKeys.join(",") || "none"}`,
    dataKeys.length ? `data=${dataKeys.join(",")}` : "",
    firstDataKeys.length ? `data[0]=${firstDataKeys.join(",")}` : "",
  ].filter(Boolean).join("; ");
}

function parseProgress(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.min(Math.max(Math.round(value), 0), 100);
  if (typeof value === "string") {
    const match = value.match(/\d+(?:\.\d+)?/);
    if (match) return Math.min(Math.max(Math.round(Number(match[0])), 0), 100);
  }
  return 1;
}

function isImageTaskDoneStatus(status?: string): boolean {
  return ["SUCCESS", "SUCCEEDED", "COMPLETED", "DONE"].includes(String(status || "").toUpperCase());
}

function isImageTaskFailedStatus(status?: string): boolean {
  return ["FAILURE", "FAILED", "ERROR", "CANCELLED", "CANCELED"].includes(String(status || "").toUpperCase());
}

function isImageTaskQueuedStatus(status?: string): boolean {
  return ["NOT_START", "PENDING", "QUEUED", "SUBMITTED"].includes(String(status || "").toUpperCase());
}

function getImageTaskPollIntervalMs() {
  const value = Number(process.env.IMAGE_TASK_POLL_INTERVAL_MS || 2500);
  return Number.isFinite(value) ? Math.min(Math.max(value, 1000), 10000) : 2500;
}

function getImageTaskTimeoutMs() {
  const value = Number(process.env.IMAGE_TASK_TIMEOUT_MS || 10 * 60 * 1000);
  return Number.isFinite(value) ? Math.min(Math.max(value, 30_000), 30 * 60 * 1000) : 10 * 60 * 1000;
}

function getImageTaskResultGraceMs() {
  const value = Number(process.env.IMAGE_TASK_RESULT_GRACE_MS || 90_000);
  return Number.isFinite(value) ? Math.min(Math.max(value, 10_000), 5 * 60 * 1000) : 90_000;
}

function getImageTaskPollErrorRetryLimit() {
  const value = Number(process.env.IMAGE_TASK_POLL_ERROR_RETRY_LIMIT || 12);
  return Number.isFinite(value) ? Math.min(Math.max(Math.floor(value), 0), 60) : 12;
}

function getImageApiBaseUrl(): string {
  const envValue = process.env.LINGYA_BASE_URL;
  return envValue ? normalizeOpenAiCompatibleBaseUrl(envValue) : DEFAULT_API_BASE;
}

function getPlatoApiBaseUrl(): string {
  const envValue = process.env.PLATO_BASE_URL;
  const normalized = envValue ? normalizeOpenAiCompatibleBaseUrl(envValue) : "";
  if (!normalized || isDeprecatedGptImage2ProviderBase(normalized)) return DEFAULT_PLATO_API_BASE;
  return normalized;
}

function getLaozhangApiBaseUrl(): string {
  const raw = (process.env.LAOZHANG_BASE_URL || DEFAULT_LAOZHANG_API_BASE).trim().replace(/\/+$/, "");
  return raw.replace(/\/v1beta$/i, "").replace(/\/v1$/i, "");
}

function getImageProvider(model: LingyaModel): { name: string; apiBase: string; apiKey?: string } {
  if (model === "gpt-image-2") {
    return {
      name: "plato",
      apiBase: getPlatoApiBaseUrl(),
      apiKey: process.env.PLATO_API_KEY || process.env.LINGYA_API_KEY,
    };
  }
  if (isNanoBananaModel(model)) {
    return {
      name: "laozhang",
      apiBase: getLaozhangApiBaseUrl(),
      apiKey: process.env.LAOZHANG_API_KEY?.trim(),
    };
  }

  return {
    name: "lingya",
    apiBase: getImageApiBaseUrl(),
    apiKey: process.env.LINGYA_API_KEY,
  };
}

function getImageGenerationUrl(apiBase: string, provider: { name: string }): string {
  const endpoint = `${apiBase}/images/generations`;
  return shouldRequestAsyncImageTask(provider) ? `${endpoint}?async=true` : endpoint;
}

function getImageEditUrl(apiBase: string): string {
  return `${apiBase}/images/edits`;
}

function getLaozhangGenerateContentUrl(apiBase: string, model: string): string {
  return `${apiBase}/v1beta/models/${encodeURIComponent(model)}:generateContent`;
}

function shouldRequestAsyncImageTask(provider: { name: string }): boolean {
  return provider.name !== "plato" && provider.name !== "laozhang";
}

function resolveProviderImageModel(model: LingyaModel, provider: { name: string }): string {
  if (provider.name === "plato" && model === "gpt-image-2") {
    return process.env.PLATO_GPT_IMAGE_MODEL?.trim() || DEFAULT_GPT_IMAGE_2_PROVIDER_MODEL;
  }
  if (provider.name === "laozhang" && model === "nano-banana-2") {
    return process.env.LAOZHANG_NANO_BANANA_MODEL?.trim() || DEFAULT_NANO_BANANA_PROVIDER_MODEL;
  }
  if (provider.name === "laozhang" && model === "nano-banana-pro") {
    return process.env.LAOZHANG_NANO_BANANA_PRO_MODEL?.trim() || DEFAULT_NANO_BANANA_PRO_PROVIDER_MODEL;
  }
  return model;
}

function isDeprecatedGptImage2ProviderBase(apiBase: string) {
  try {
    return new URL(apiBase).hostname === "api.bltcy.ai";
  } catch {
    return false;
  }
}

/**
 * gpt-image-2 只接受标准尺寸，映射宽高比到 API 支持的值
 */
function resolveGptImage2Size(aspectRatio: AspectRatio): string {
  const map: Record<string, string> = {
    "1:1": "1024x1024",
    "3:4": "1024x1536",
    "4:3": "1536x1024",
    "9:16": "1024x1536",
    "16:9": "1536x1024",
    "2:3": "1024x1536",
    "3:2": "1536x1024",
    "4:5": "1024x1536",
    "5:4": "1536x1024",
    "21:9": "1536x1024",
  };
  return map[aspectRatio] || "auto";
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

function normalizeImageMimeType(value: string | null): string {
  return value?.split(";")[0]?.trim().toLowerCase() || "";
}

function inferImageMimeType(src: string): string | undefined {
  const dataMatch = src.match(/^data:([^;,]+)/i);
  if (dataMatch && isSupportedEditImageMime(dataMatch[1].toLowerCase())) {
    return dataMatch[1].toLowerCase();
  }

  let pathname = src;
  try {
    pathname = new URL(src).pathname;
  } catch {
    // Keep the raw value for extension inference.
  }

  const lower = pathname.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  return undefined;
}

function isSupportedEditImageMime(value?: string): value is string {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}

function buildImageFilename(src: string, index: number, mimeType: string): string {
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.replace("image/", "") || "png";
  let basename = "";

  if (!src.startsWith("data:")) {
    try {
      basename = decodeURIComponent(new URL(src).pathname.split("/").pop() || "");
    } catch {
      basename = "";
    }
  }

  const safeName = basename.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 80);
  if (!safeName || !/\.(png|jpe?g|webp)$/i.test(safeName)) {
    return `reference-${index + 1}.${extension}`;
  }
  return safeName;
}

function normalizeLaozhangAspectRatio(value?: AspectRatio): string {
  return value && value !== "auto" ? value : "1:1";
}

function isNanoBananaModel(model: LingyaModel): boolean {
  return model === "nano-banana-2" || model === "nano-banana-pro";
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
  garmentCategory?: TryOnGarmentCategory;
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
  const explicitSlotText = clothingRefs
    .map((ref, index) => `${ref}的${TRYON_CLOTHING_ROLE_LABELS[normalizedRoles[index]] || "服装"}`)
    .join("、");
  const clothingText = clothingMode === "multi"
    ? normalizedRoles.includes("upper") && normalizedRoles.includes("lower")
      ? `${clothingRefs.join("、")}的上装与下装`
      : explicitSlotText
    : `${mainClothingRef}的连体/全身服装`;
  const outfitAssemblyRule = clothingMode === "multi"
    ? "用户已选择换上下装槽位：每张服装图必须按显式槽位正确穿着，上装只替换上半身衣服，下装只替换下半身衣服；如果只上传一个槽位，只替换该槽位覆盖的服装并保留不冲突穿搭，保持层次关系、遮挡关系、腰线衔接和真实垂坠，不要把不同槽位融合成一件新衣服。"
    : `用户已选择连体/全身槽位：将${mainClothingRef}作为一件完整连体衣、连衣裙、套装或全身服装来处理，替换它覆盖范围内所有冲突的上装和下装，不要把它拆成无关上下装，也不要额外生成${mainClothingRef}以外的新服装；鞋履和不冲突配饰可自然保留。`;
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
        garmentCategory: params.garmentCategory,
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
    buildTryOnGarmentCategoryPrompt({
      garmentCategory: params.garmentCategory,
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
    garmentCategory: params.garmentCategory,
    hasReference: params.hasReference,
    hasModelFace: params.hasModelFace,
    referenceImageNumber,
    modelFaceImageNumber: faceImageNumber,
  });
  const negativeRule = buildTryOnNegativePrompt({
    garmentAudience: params.garmentAudience,
    ageGroup: params.ageGroup,
    garmentCategory: params.garmentCategory,
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
  garmentCategory?: TryOnGarmentCategory;
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
    lines.push(`Task: use ${clothingSource} only as ${sourceNoun}; replace the outfit on the person in ${targetRef} with the clothing from ${clothingSource}; keep ${targetRef}'s pose/body/head placement/background/camera/framing/lighting/skin continuity; adapt only the recognizable face identity from ${faceRef}.`);
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
    lines.push(buildConciseFaceIntegrationRule({
      hasReference: params.hasReference,
      targetRef,
      faceRef,
    }));
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
  if (params.garmentCategory === "intimate") {
    lines.push("Sensitive apparel rule: treat the source as adult intimate apparel or swimwear for a neutral commercial catalog/lookbook photo; keep the image non-erotic, non-suggestive, and do not show nudity, nipples, genitals, transparent exposure, sexual acts, bedroom/erotic scenes, minors, or minor-looking people.");
  }
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
    roles.push(`image ${params.referenceImageNumber} = target body / pose / head placement / composition / background / lighting / skin continuity ONLY`);
  }
  if (params.hasModelFace) {
    roles.push(`image ${params.faceImageNumber} = face identity ONLY, not head pose, head scale, lighting, or final skin color`);
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
    return `Conflict priority: facial identity = ${params.faceRef}; head pose, gaze, expression intensity, head scale, neck/shoulder connection, lighting, final skin color, body/pose/composition/background = ${params.targetRef}; clothing = ${params.clothingSource}. No hard face-swap, no ID-photo face, no pasted-head look.`;
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
    return `Failure handling: if anything is ambiguous, keep ${params.targetRef}'s original head box, head turn, body skin tone, light/shadow, pose, and scene; transfer only the recognizable identity from ${params.faceRef}; clothing accuracy stays from ${params.clothingSource}.`;
  }

  if (params.hasReference) {
    return `Failure handling: if anything is ambiguous, never use identity, pose, or scene from ${params.clothingSource}; clothing accuracy from ${params.clothingSource} and body/scene from ${params.targetRef} are mandatory.`;
  }

  if (params.hasModelFace) {
    return `Failure handling: if anything is ambiguous, never use identity from ${params.clothingSource}; face identity must stay from ${params.faceRef} and clothing accuracy from ${params.clothingSource}.`;
  }

  return `Failure handling: if anything is ambiguous, use ${params.clothingSource} only for clothing and generate one neutral photorealistic model.`;
}

function buildConciseFaceIntegrationRule(params: {
  hasReference: boolean;
  targetRef: string;
  faceRef: string;
}) {
  if (params.hasReference) {
    return `Face integration rule: do not perform a hard face swap. Rebuild one coherent person in ${params.targetRef}'s existing head space. Use ${params.faceRef} only for recognizable identity, facial structure, and hairstyle character; keep ${params.targetRef}'s head box, head turn, gaze direction, expression intensity, head-to-body ratio, neck length, neck/shoulder connection, camera distance, lighting direction, exposure, color temperature, shadows, and final visible skin color. Match the face to ${params.targetRef}'s neck/chest/arms/hands with continuous undertone, brightness, reflected light, pores, subtle redness, and natural shadow falloff. If ${params.faceRef} conflicts with ${params.targetRef}, ${params.targetRef} wins for pose, scale, skin tone, light, hair/accessory occlusion, and perspective. No pasted head, ID-photo face, mask edge, mismatched skin, porcelain retouch, oversized head, long neck, separate lighting, or face-swap seam.`;
  }

  return `${params.faceRef} is the final face identity source. Use its facial structure, hair, natural skin tone, and expression style, while keeping a realistic head size, neck connection, lighting, and skin texture for one coherent commercial fashion photo.`;
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

  return "Single-garment rule: image 1 was uploaded into the explicit one-piece/full-outfit slot. Treat it as one complete dress, jumpsuit, set, coat, or full-body garment; replace every conflicting target garment it covers, do not split it into unrelated upper/lower pieces, and do not invent extra clothing outside image 1.";
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

export const __lingyaTaskResponseTestUtils = {
  buildLaozhangNativeImageRequest,
  buildGenerateRequestBody,
  calculateImageRequestHeartbeatProgress,
  extractGeneratedImages,
  getImageEditUrl,
  getImageGenerationUrl,
  getLaozhangGenerateContentUrl,
  getPlatoApiBaseUrl,
  normalizeImageTaskResponse,
  resolveProviderImageModel,
  shouldUseLaozhangNativeEndpoint,
  shouldUseImageEditEndpoint,
  shouldRequestAsyncImageTask,
};
