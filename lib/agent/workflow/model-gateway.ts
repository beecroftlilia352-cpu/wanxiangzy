import { batchTryOn, generateImage, type AspectRatio, type ImageSize, type ImageTaskProgress, type LingyaModel } from "@/lib/api/lingya";
import { normalizeGeneratedImageUrl } from "@/lib/api/image-result";
import type { StepExecutionProgress, WorkflowToolType } from "@/lib/agent/workflow/types";

export type GatewayImageRequest = {
  model: LingyaModel;
  prompt: string;
  promptForIndex?: (index: number, total: number) => string;
  promptKind?: "model" | "grass" | "modelBackground" | "pose" | "garment3d" | "tryon" | "faceSwap";
  toolType?: WorkflowToolType;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  images?: string[];
  count: number;
  onProgress?: (update: StepExecutionProgress) => Promise<void> | void;
};

export type GatewayTryonRequest = {
  model: LingyaModel;
  clothingUrls: string[];
  referenceUrl?: string;
  modelFaceUrl?: string;
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  count: number;
  style?: string;
  onProgress?: (update: StepExecutionProgress) => Promise<void> | void;
};

export async function gatewayGenerateImages(request: GatewayImageRequest) {
  const urls: string[] = [];
  const promptTrace = [];
  const started = Date.now();

  for (let index = 0; index < request.count; index++) {
    const prompt = request.promptForIndex?.(index + 1, request.count) || request.prompt;
    const result = await generateImage({
      model: request.model,
      prompt,
      prompt_kind: request.promptKind,
      aspect_ratio: request.aspectRatio,
      image_size: request.imageSize,
      image: request.images,
      onProgress: (progress) => request.onProgress?.(mapGatewayProgress(progress, index, request.count)),
    });
    urls.push(normalizeGeneratedImageUrl(result));
    promptTrace.push({
      index: index + 1,
      toolType: request.toolType || "image_to_image",
      model: request.model,
      promptKind: request.promptKind || "workflow",
      prompt: result.prompt || prompt,
      compiledPrompt: result.compiledPrompt || result.prompt || prompt,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    urls,
    promptTrace,
    providerTrace: [{
      provider: "image-gateway",
      model: request.model,
      status: "ok" as const,
      latencyMs: Date.now() - started,
    }],
  };
}

export async function gatewayTryOn(request: GatewayTryonRequest) {
  const urls: string[] = [];
  const promptTrace = [];
  const started = Date.now();

  for (let index = 0; index < request.count; index++) {
    const result = await batchTryOn({
      model: request.model,
      clothingUrls: request.clothingUrls,
      referenceUrl: request.referenceUrl,
      modelFaceUrl: request.modelFaceUrl,
      aspect_ratio: request.aspectRatio,
      image_size: request.imageSize,
      style: request.style,
      onProgress: (progress) => request.onProgress?.(mapGatewayProgress(progress, index, request.count)),
    });
    urls.push(...result.resultUrls);
    promptTrace.push({
      index: index + 1,
      toolType: "tryon" as const,
      model: request.model,
      promptKind: "tryon",
      prompt: result.prompt,
      compiledPrompt: result.compiledPrompt,
      createdAt: new Date().toISOString(),
    });
  }

  return {
    urls,
    promptTrace,
    providerTrace: [{
      provider: "image-gateway",
      model: request.model,
      status: "ok" as const,
      latencyMs: Date.now() - started,
    }],
  };
}

function mapGatewayProgress(progress: ImageTaskProgress, index: number, total: number): StepExecutionProgress {
  const safeTotal = Math.max(1, total);
  const current = Math.min(Math.max(Math.round(Number(progress.progress) || 0), 0), 100);
  const overall = Math.min(99, Math.round(((index + current / 100) / safeTotal) * 100));
  return {
    progress: overall,
    taskId: progress.taskId,
    providerStatus: progress.providerStatus || progress.status,
    message: getGatewayProgressMessage(progress.providerStatus || progress.status, overall),
  };
}

function getGatewayProgressMessage(status: string | undefined, progress: number) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "NOT_START" || normalized === "QUEUED") return `任务已提交，等待生成 ${progress}%`;
  if (normalized === "SUCCESS") return `生成完成，正在整理结果 ${progress}%`;
  if (normalized === "FAILURE" || normalized === "FAILED" || normalized === "ERROR") return "生成任务失败";
  return `正在生成图片 ${progress}%`;
}
