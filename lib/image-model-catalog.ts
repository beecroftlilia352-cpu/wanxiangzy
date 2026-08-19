import {
  IMAGE_CREDIT_COSTS,
  IMAGE_MODEL_DISPLAY_ORDER,
  type PricedImageModel,
  type PricedImageSize,
} from "@/lib/model-pricing";
import type { AiModelLocalizedPresentation } from "@/lib/ai-control-plane/types";

export type ImageModelCatalogItem = {
  id: string;
  displayName: string;
  description?: string;
  creditPrices: Partial<Record<PricedImageSize, number>>;
  supportedSizes: PricedImageSize[];
  capabilities: string[];
  shortTitle?: string;
  badge?: string;
  iconUrl?: string;
  coverUrl?: string;
  group?: string;
  tags?: string[];
  sortOrder?: number;
  featured?: boolean;
  locales?: Record<string, AiModelLocalizedPresentation>;
};

const runtimeCatalog = new Map<string, ImageModelCatalogItem>();

export const LEGACY_IMAGE_MODEL_CATALOG: ImageModelCatalogItem[] = IMAGE_MODEL_DISPLAY_ORDER.map((id) => ({
  id,
  displayName: legacyDisplayName(id),
  creditPrices: { ...IMAGE_CREDIT_COSTS[id] },
  supportedSizes: Object.keys(IMAGE_CREDIT_COSTS[id]) as PricedImageSize[],
  capabilities: ["generation", "edit"],
}));

export function registerImageModelCatalog(items: readonly ImageModelCatalogItem[]) {
  runtimeCatalog.clear();
  for (const item of items) runtimeCatalog.set(item.id, item);
}

export function getRegisteredImageModel(modelId: string) {
  return runtimeCatalog.get(modelId);
}

export function getRegisteredImageCreditCost(modelId: string, size: PricedImageSize) {
  return runtimeCatalog.get(modelId)?.creditPrices[size];
}

export function getRegisteredImageSizes(modelId: string): PricedImageSize[] | undefined {
  const sizes = runtimeCatalog.get(modelId)?.supportedSizes;
  return sizes?.length ? [...sizes] : undefined;
}

export function isPricedImageModel(value: string): value is PricedImageModel {
  return Object.prototype.hasOwnProperty.call(IMAGE_CREDIT_COSTS, value);
}

function legacyDisplayName(id: PricedImageModel) {
  if (id === "nano-banana-2") return "Nano Banana 2";
  if (id === "nano-banana-pro") return "Nano Banana Pro";
  return "GPT Image 2";
}
