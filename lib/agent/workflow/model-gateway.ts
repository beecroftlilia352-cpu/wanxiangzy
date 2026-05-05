import { batchTryOn, generateImage, type AspectRatio, type ImageSize, type LingyaModel } from "@/lib/api/lingya";
import { normalizeGeneratedImageUrl } from "@/lib/api/image-result";

export type GatewayImageRequest = {
  model: LingyaModel;
  prompt: string;
  promptKind?: "model" | "grass" | "modelBackground" | "pose" | "garment3d" | "tryon";
  aspectRatio: AspectRatio;
  imageSize: ImageSize;
  images?: string[];
  count: number;
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
};

export async function gatewayGenerateImages(request: GatewayImageRequest) {
  const urls: string[] = [];
  const promptTrace = [];
  const started = Date.now();

  for (let index = 0; index < request.count; index++) {
    const result = await generateImage({
      model: request.model,
      prompt: request.prompt,
      prompt_kind: request.promptKind,
      aspect_ratio: request.aspectRatio,
      image_size: request.imageSize,
      image: request.images,
    });
    urls.push(normalizeGeneratedImageUrl(result));
    promptTrace.push({
      index: index + 1,
      toolType: "image_to_image" as const,
      model: request.model,
      promptKind: request.promptKind || "workflow",
      prompt: result.prompt || request.prompt,
      compiledPrompt: result.compiledPrompt || result.prompt || request.prompt,
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
