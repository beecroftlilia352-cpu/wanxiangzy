export const MAX_GENERAL_IMAGE_REFERENCE_IMAGES = 14;
/** Absolute ceiling for a single multi-to-one run: 14 references × 4 images each. */
export const MAX_GENERAL_IMAGE_TOTAL_COUNT = MAX_GENERAL_IMAGE_REFERENCE_IMAGES * 4;

export type GeneralImageMode = "text-to-image" | "image-to-image";

export function getGeneralImageDefaultSettings(mode: GeneralImageMode) {
  return {
    model: mode === "text-to-image" ? "gpt-image-2" : "nano-banana-2",
    aspectRatio: "3:4",
    imageSize: "2K",
  } as const;
}
