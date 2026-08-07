export type PricedImageModel = "gpt-image-2" | "nano-banana-pro" | "nano-banana-2";
export type PricedImageSize = "1K" | "2K" | "4K";

export const IMAGE_MODEL_DISPLAY_ORDER: readonly PricedImageModel[] = [
  "nano-banana-2",
  "gpt-image-2",
  "nano-banana-pro",
];

/**
 * The single source of truth for customer-facing generation prices.
 *
 * Keep these values independent from provider implementation details so the
 * same table can be imported safely by both client and server code.
 */
export const IMAGE_CREDIT_COSTS = {
  "nano-banana-2": { "1K": 4, "2K": 6, "4K": 8 },
  "gpt-image-2": { "1K": 3, "2K": 4, "4K": 5 },
  "nano-banana-pro": { "1K": 8, "2K": 10, "4K": 12 },
} as const satisfies Record<PricedImageModel, Record<PricedImageSize, number>>;

export const VIDEO_CREDIT_RATES = {
  fast: {
    "720p": { minimum: 15, perSecond: 3 },
  },
  pro: {
    "720p": { minimum: 25, perSecond: 4 },
    "1080p": { minimum: 40, perSecond: 6 },
  },
} as const;

export const AUDIO_CREDIT_COST = 2;

export function getImageCreditCost(model: PricedImageModel, size: PricedImageSize) {
  return IMAGE_CREDIT_COSTS[model][size];
}

export function getImageCreditCostRange(model: PricedImageModel) {
  const costs = Object.values(IMAGE_CREDIT_COSTS[model]);
  return { minimum: Math.min(...costs), maximum: Math.max(...costs) };
}
