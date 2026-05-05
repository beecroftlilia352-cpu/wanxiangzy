import {
  getSupportedImageSizes,
  normalizeAspectRatio,
  normalizeImageSize,
  normalizeLingyaModel,
  type AspectRatio,
  type ImageSize,
  type LingyaModel,
} from "@/lib/api/lingya";
import type { ModelCapabilityKey } from "@/lib/agent/workflow/types";

export type WorkflowModelCapability = {
  model: LingyaModel;
  provider: "lingya" | "plato" | "xiaomi" | "unknown";
  supportsTextToImage: boolean;
  supportsImageToImage: boolean;
  supportsMultiImage: boolean;
  supportsVideo: boolean;
  supports3dAsset: boolean;
  supportedRatios: AspectRatio[];
  supportedSizes: ImageSize[];
  maxImages: number;
  maxPromptLength: number;
};

const RATIOS: AspectRatio[] = ["auto", "1:1", "9:16", "16:9", "4:3", "3:4", "2:3", "3:2", "4:5", "5:4", "21:9"];

export function getWorkflowModelCapability(rawModel: unknown, aspectRatio?: unknown): WorkflowModelCapability {
  const model = normalizeLingyaModel(rawModel);
  const ratio = normalizeAspectRatio(aspectRatio || "3:4");
  return {
    model,
    provider: inferProvider(model),
    supportsTextToImage: true,
    supportsImageToImage: true,
    supportsMultiImage: true,
    supportsVideo: false,
    supports3dAsset: false,
    supportedRatios: RATIOS,
    supportedSizes: getSupportedImageSizes(model, ratio),
    maxImages: model === "gpt-image-2" ? 8 : 10,
    maxPromptLength: model === "doubao-seedream-4-5-251128" ? 8000 : 12000,
  };
}

export function supportsRequiredCapabilities(
  capability: WorkflowModelCapability,
  required: ModelCapabilityKey[]
): { ok: boolean; missing: ModelCapabilityKey[] } {
  const missing = required.filter((item) => !hasCapability(capability, item));
  return { ok: missing.length === 0, missing };
}

export function normalizeWorkflowGenerationDefaults(params: {
  model?: unknown;
  aspectRatio?: unknown;
  imageSize?: unknown;
}): { model: LingyaModel; aspectRatio: AspectRatio; imageSize: ImageSize } {
  const model = normalizeLingyaModel(params.model);
  const aspectRatio = normalizeAspectRatio(params.aspectRatio || "3:4");
  const imageSize = normalizeImageSize(model, (params.imageSize as ImageSize) || "1K", aspectRatio);
  return { model, aspectRatio, imageSize };
}

function hasCapability(capability: WorkflowModelCapability, key: ModelCapabilityKey) {
  if (key === "text_to_image") return capability.supportsTextToImage;
  if (key === "image_to_image") return capability.supportsImageToImage;
  if (key === "multi_image") return capability.supportsMultiImage;
  if (key === "video") return capability.supportsVideo;
  if (key === "3d_asset") return capability.supports3dAsset;
  return false;
}

function inferProvider(model: LingyaModel): WorkflowModelCapability["provider"] {
  if (model.startsWith("doubao-seedream-")) return "plato";
  if (model.startsWith("nano-banana")) return "lingya";
  if (model === "gpt-image-2") return "lingya";
  return "unknown";
}
